var _jsxFileName = "C:\\Users\\velin\\OneDrive\\Desktop\\GIT\\ktm-hike-trail\\src\\App.js",
  _s = $RefreshSig$();
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Compass, X, Filter, Sun, Moon, RefreshCw, Menu, AlertTriangle, Upload } from 'lucide-react';
import MapView from './components/MapView';
import RouteCard from './components/RouteCard';
import RouteDetail from './components/RouteDetail';
import { parseGPX, parseKML } from './utils/kmlParser';
import { resolveAssetUrl } from './utils/assetUrl';
import './index.css';
import { auth, signInWithPopup, signOut, googleProvider } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
export { resolveAssetUrl };

// Notify the map whenever sidebar toggles
const fireSidebarToggle = () => {
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 50);
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 200);
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 400);
};
export default function App() {
  _s();
  const [routes, setRoutes] = useState([]);
  const [activeRoute, setActiveRoute] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [sortBy, setSortBy] = useState('uploadedAt');
  const [showFilters, setShowFilters] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ht-theme') || 'day');
  const [loadingState, setLoadingState] = useState({
    status: 'idle',
    progress: 0,
    total: 0,
    loaded: 0,
    errors: []
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLoading, setIsLoading] = useState(true);
  const [detailPanelHeight, setDetailPanelHeight] = useState(0);
  const [isContributionOpen, setIsContributionOpen] = useState(false);
  const [contributionName, setContributionName] = useState('');
  const [contributionFile, setContributionFile] = useState(null);
  const [contributionError, setContributionError] = useState('');
  const [isContributing, setIsContributing] = useState(false);
  const [authModalName, setAuthModalName] = useState('');
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // When a route is activated, pre-calculate the default panel height
  const handleDetailPanelHeightChange = h => setDetailPanelHeight(h);
  const hasAutoLoadedRoute = useRef(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (!auth) return undefined;
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'day' ? 'day' : '');
    localStorage.setItem('ht-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'day' : 'dark');

  // Load KML files from /kml/manifest.json at startup
  const loadKMLFolder = useCallback(async () => {
    setLoadingState({
      status: 'loading',
      progress: 0,
      total: 0,
      loaded: 0,
      errors: []
    });
    setRoutes([]);
    try {
      const manifestRes = await fetch(`${resolveAssetUrl('/kml/routes-metadata.json')}?t=${Date.now()}`);
      if (!manifestRes.ok) throw new Error('routes-metadata.json not found in /public/kml/');
      const metadataMap = await manifestRes.json();
      const fileNames = Object.keys(metadataMap);
      if (fileNames.length === 0) {
        setLoadingState({
          status: 'done',
          progress: 100,
          total: 0,
          loaded: 0,
          errors: ['No KML files listed in routes-metadata.json']
        });
        return;
      }
      const loadedRoutes = Object.entries(metadataMap).map(([fileName, meta]) => {
        var _meta$stats;
        return {
          id: Math.random().toString(36).substr(2, 9),
          fileName: fileName,
          name: meta.name,
          description: meta.description,
          difficulty: meta.difficultyOverride !== "Auto" ? meta.difficultyOverride : meta.calculatedDifficulty,
          stats: {
            ...meta.stats,
            estimatedHours: meta.hoursOverride !== "Auto" ? meta.hoursOverride : (_meta$stats = meta.stats) === null || _meta$stats === void 0 ? void 0 : _meta$stats.estimatedHours
          },
          province: meta.province || '',
          district: meta.district || '',
          nearbyCity: meta.nearbyCity || '',
          highlights: meta.highlights || '',
          uploadedAt: meta.uploadedAt || '',
          bounds: meta.bounds,
          coordinates: meta.startPos ? [meta.startPos, meta.startPos] : [],
          isLazyLoaded: false
        };
      });
      setRoutes(loadedRoutes);
      setLoadingState({
        status: 'done',
        progress: 100,
        total: loadedRoutes.length,
        loaded: loadedRoutes.length,
        errors: []
      });
    } catch (e) {
      setLoadingState({
        status: 'error',
        progress: 0,
        total: 0,
        loaded: 0,
        errors: [e.message]
      });
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadKMLFolder();
  }, [loadKMLFolder]);
  const handleRouteClick = useCallback(async route => {
    localStorage.setItem(`route-viewed-${route.id}`, Date.now().toString());

    // On mobile, hide the sidebar so the map + elevation card are visible
    if (isMobile) {
      setSidebarOpen(false);
      fireSidebarToggle();
    }

    // IMMEDIATE FEEDBACK: Highlight card and open panel instantly
    const routeWithLoadingState = {
      ...route,
      loadError: null
    };
    setActiveRoute(routeWithLoadingState);
    setRoutes(prev => prev.map(r => r.id === route.id ? routeWithLoadingState : r));
    if (!route.isLazyLoaded) {
      try {
        var _split$pop;
        const res = await fetch(`${resolveAssetUrl(`/kml/${encodeURIComponent(route.fileName)}`)}?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${route.fileName}`);
        const text = await res.text();

        // Yield to the browser to let the UI slide-up animation run smoothly
        // before blocking the main thread with heavy KML parsing
        await new Promise(resolve => setTimeout(resolve, 350));
        const routeExtension = (_split$pop = (route.fileName || '').split('.').pop()) === null || _split$pop === void 0 ? void 0 : _split$pop.toLowerCase();
        const parser = routeExtension === 'gpx' ? parseGPX : parseKML;
        const fullParsed = parser(text, route.fileName);
        if (!fullParsed) throw new Error(`${(routeExtension === null || routeExtension === void 0 ? void 0 : routeExtension.toUpperCase()) || 'Route'} file has no valid route geometry`);
        if (fullParsed) {
          const updatedRoute = {
            ...fullParsed,
            id: route.id,
            name: route.name,
            description: route.description,
            difficulty: route.difficulty,
            province: route.province,
            district: route.district,
            nearbyCity: route.nearbyCity,
            highlights: route.highlights,
            isLazyLoaded: true,
            loadError: null
          };
          updatedRoute.stats.estimatedHours = route.stats.estimatedHours;
          setRoutes(prev => prev.map(r => r.id === route.id ? updatedRoute : r));
          setActiveRoute(updatedRoute);
        }
      } catch (err) {
        console.error('Failed to load KML', err);
        const failedRoute = {
          ...route,
          loadError: (err === null || err === void 0 ? void 0 : err.message) || 'Failed to parse KML file'
        };
        setRoutes(prev => prev.map(r => r.id === route.id ? failedRoute : r));
        setActiveRoute(failedRoute);
      }
    }
  }, [isMobile]);

  // Handle URL route sharing parameter
  useEffect(() => {
    if (loadingState.status === 'done' && !hasAutoLoadedRoute.current && routes.length > 0) {
      hasAutoLoadedRoute.current = true;
      const params = new URLSearchParams(window.location.search);
      const sharedRouteFile = params.get('route');
      if (sharedRouteFile) {
        const routeToLoad = routes.find(r => r.fileName === sharedRouteFile);
        if (routeToLoad) {
          handleRouteClick(routeToLoad);

          // Clear the parameter from the URL so reloading doesn't re-trigger it
          // while keeping the page state
          const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({
            path: newUrl
          }, '', newUrl);
        }
      }
    }
  }, [loadingState.status, routes, handleRouteClick]);
  const handleDeleteRoute = useCallback(id => {
    setRoutes(prev => prev.filter(r => r.id !== id));
    setActiveRoute(prev => (prev === null || prev === void 0 ? void 0 : prev.id) === id ? null : prev);
  }, []);
  const handleContributionFile = event => {
    var _event$target$files, _file$name$split$pop;
    const file = (_event$target$files = event.target.files) === null || _event$target$files === void 0 ? void 0 : _event$target$files[0];
    if (!file) return;
    const extension = (_file$name$split$pop = file.name.split('.').pop()) === null || _file$name$split$pop === void 0 ? void 0 : _file$name$split$pop.toLowerCase();
    if (!['gpx', 'kml', 'json'].includes(extension)) {
      setContributionFile(null);
      setContributionError('Choose a GPX, KML, or JSON file.');
      return;
    }
    setContributionFile(file);
    setContributionError('');
  };
  const handleContribute = async event => {
    event.preventDefault();
    if (!contributionFile || !contributionName.trim()) {
      setContributionError('Add a trail name and choose a GPX or KML file.');
      return;
    }
    setIsContributing(true);
    try {
      var _contributionFile$nam;
      const fileText = await contributionFile.text();
      const extension = (_contributionFile$nam = contributionFile.name.split('.').pop()) === null || _contributionFile$nam === void 0 ? void 0 : _contributionFile$nam.toLowerCase();
      if (extension === 'json') {
        JSON.parse(fileText);
      } else {
        const parsedRoute = extension === 'gpx' ? parseGPX(fileText, contributionFile.name, contributionName) : parseKML(fileText, contributionFile.name, contributionName);
        if (!parsedRoute) throw new Error('No route points were found in that file.');
      }
      const formData = new FormData();
      formData.append('name', contributionName.trim());
      formData.append('file', contributionFile);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(response.status === 404 ? 'Upload API not found. Start the Express server with "node server.js" and restart the React app.' : 'Upload API returned an invalid response. Check that the Express server is running.');
      }
      if (!response.ok) throw new Error(result.error || 'Could not save this route.');
      if (extension === 'kml' || extension === 'gpx') await loadKMLFolder();
      setIsContributionOpen(false);
      setContributionName('');
      setContributionFile(null);
      setContributionError('');
    } catch (error) {
      setContributionError(error.message || 'Could not read this route file.');
    } finally {
      setIsContributing(false);
    }
  };
  const handleGoogleSignIn = async () => {
    if (!authModalName.trim()) {
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      localStorage.setItem('userName', authModalName.trim());
      setIsAuthModalOpen(false);
      setAuthModalName('');
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };
  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
  };
  const filteredRoutes = routes.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase()) || r.province && r.province.toLowerCase().includes(searchQuery.toLowerCase()) || r.highlights && r.highlights.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDiff = filterDifficulty === 'All' || r.difficulty === filterDifficulty;
    const matchLoc = filterLocation === 'All' || r.district === filterLocation;
    return matchSearch && matchDiff && matchLoc;
  }).sort((a, b) => {
    if (sortBy === 'distance') return b.stats.distance - a.stats.distance;
    if (sortBy === 'gain') return b.stats.elevationGain - a.stats.elevationGain;
    if (sortBy === 'difficulty') {
      const o = {
        Easy: 0,
        Moderate: 1,
        Hard: 2,
        Extreme: 3
      };
      return o[b.difficulty] - o[a.difficulty];
    }
    if (sortBy === 'uploadedAt') {
      return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
    }
    return a.name.localeCompare(b.name);
  });
  const totalStats = routes.reduce((acc, r) => {
    var _r$stats, _r$stats2;
    return {
      distance: acc.distance + (((_r$stats = r.stats) === null || _r$stats === void 0 ? void 0 : _r$stats.distance) || 0),
      gain: acc.gain + (((_r$stats2 = r.stats) === null || _r$stats2 === void 0 ? void 0 : _r$stats2.elevationGain) || 0)
    };
  }, {
    distance: 0,
    gain: 0
  });
  const isDark = theme === 'dark';
  return /*#__PURE__*/_jsxDEV("div", {
    style: {
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      position: 'relative'
    },
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        width: sidebarOpen ? isMobile ? '100%' : 425 : 0,
        minWidth: sidebarOpen ? isMobile ? '100%' : 425 : 0,
        overflow: 'hidden',
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--sidebar-bg)',
        borderRight: `1px solid var(--sidebar-border)`,
        position: isMobile ? 'absolute' : 'relative',
        height: '100%',
        zIndex: 2000
      },
      children: /*#__PURE__*/_jsxDEV("div", {
        style: {
          width: isMobile ? '100%' : 425,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            padding: '20px 20px 0',
            flexShrink: 0
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4
            },
            children: [/*#__PURE__*/_jsxDEV("button", {
              className: "theme-toggle",
              onClick: () => {
                setSidebarOpen(false);
                fireSidebarToggle();
              },
              title: "Close Sidebar",
              style: {
                border: 'none',
                background: 'transparent'
              },
              children: /*#__PURE__*/_jsxDEV(Menu, {
                size: 18
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 339,
                columnNumber: 17
              }, this)
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 338,
              columnNumber: 15
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("img", {
                src: resolveAssetUrl('/logo.png'),
                alt: "Logo",
                style: {
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  flexShrink: 0,
                  objectFit: 'cover'
                }
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 343,
                columnNumber: 3
              }, this), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  minWidth: 0
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    fontFamily: 'Montserrat, serif',
                    letterSpacing: '-0.02em',
                    lineHeight: 1
                  },
                  children: "MAP MINE"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 345,
                  columnNumber: 5
                }, this), /*#__PURE__*/_jsxDEV("a", {
                  href: "https://www.walknepalwalk.com.np/trail-maps",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: {
                    display: 'block',
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'color 0.2s',
                    marginTop: 2
                  },
                  onMouseEnter: e => e.target.style.color = 'var(--accent-primary)',
                  onMouseLeave: e => e.target.style.color = 'var(--text-muted)',
                  children: "CONTRIBUTION based Community Data"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 346,
                  columnNumber: 5
                }, this)]
              }, void 0, true, {
                fileName: _jsxFileName,
                lineNumber: 344,
                columnNumber: 3
              }, this)]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 342,
              columnNumber: 1
            }, this), user && /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--text-muted)',
                marginRight: 12
              },
              children: [user.displayName || user.email, /*#__PURE__*/_jsxDEV("button", {
                onClick: handleSignOut,
                style: {
                  marginLeft: 8,
                  color: 'var(--accent-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10
                },
                children: "Sign out"
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 362,
                columnNumber: 5
              }, this)]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 360,
              columnNumber: 3
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0
              },
              children: /*#__PURE__*/_jsxDEV("button", {
                className: "theme-toggle",
                onClick: toggleTheme,
                title: isDark ? 'Switch to Day Mode' : 'Switch to Dark Mode',
                children: isDark ? /*#__PURE__*/_jsxDEV(Sun, {
                  size: 16
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 369,
                  columnNumber: 29
                }, this) : /*#__PURE__*/_jsxDEV(Moon, {
                  size: 16
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 369,
                  columnNumber: 49
                }, this)
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 368,
                columnNumber: 17
              }, this)
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 367,
              columnNumber: 15
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 336,
            columnNumber: 13
          }, this), routes.length > 0 && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(MicroStat, {
              label: "Routes",
              value: routes.length
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 378,
              columnNumber: 17
            }, this), /*#__PURE__*/_jsxDEV(MicroStat, {
              label: "km total",
              value: totalStats.distance.toFixed(0)
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 379,
              columnNumber: 17
            }, this), /*#__PURE__*/_jsxDEV(MicroStat, {
              label: "m gain",
              value: `${(totalStats.gain / 1000).toFixed(1)}k`
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 380,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 377,
            columnNumber: 15
          }, this), /*#__PURE__*/_jsxDEV(LoadingStatus, {
            state: loadingState,
            onReload: loadKMLFolder
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 385,
            columnNumber: 13
          }, this), /*#__PURE__*/_jsxDEV("button", {
            onClick: () => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setIsContributionOpen(true);
                setContributionError('');
              }
            },
            style: {
              width: '100%',
              marginTop: 12,
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              border: '1px solid var(--accent-primary)',
              borderRadius: 8,
              background: 'rgba(249,115,22,0.1)',
              color: 'var(--accent-primary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            },
            children: [/*#__PURE__*/_jsxDEV(Upload, {
              size: 14
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 402,
              columnNumber: 3
            }, this), " Contribute map"]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 387,
            columnNumber: 11
          }, this), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                position: 'relative',
                marginBottom: 8
              },
              children: [/*#__PURE__*/_jsxDEV(Search, {
                size: 13,
                style: {
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 408,
                columnNumber: 17
              }, this), /*#__PURE__*/_jsxDEV("input", {
                value: searchQuery,
                onChange: e => setSearchQuery(e.target.value),
                placeholder: "Search routes\u2026",
                style: {
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: `1px solid var(--border)`,
                  borderRadius: 8,
                  padding: '8px 10px 8px 30px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none'
                },
                onFocus: e => e.target.style.borderColor = 'var(--accent-primary)',
                onBlur: e => e.target.style.borderColor = 'var(--border)'
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 409,
                columnNumber: 17
              }, this)]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 407,
              columnNumber: 15
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 6,
                alignItems: 'center'
              },
              children: [/*#__PURE__*/_jsxDEV("button", {
                onClick: () => setShowFilters(!showFilters),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  background: showFilters ? 'rgba(249,115,22,0.15)' : 'var(--bg-card)',
                  border: `1px solid ${showFilters ? 'var(--accent-primary)' : 'var(--border)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: showFilters ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: 11
                },
                children: [/*#__PURE__*/_jsxDEV(Filter, {
                  size: 11
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 433,
                  columnNumber: 19
                }, this), " Filter"]
              }, void 0, true, {
                fileName: _jsxFileName,
                lineNumber: 423,
                columnNumber: 17
              }, this), /*#__PURE__*/_jsxDEV("select", {
                value: sortBy,
                onChange: e => setSortBy(e.target.value),
                style: {
                  flex: 1,
                  background: 'var(--bg-card)',
                  border: `1px solid var(--border)`,
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  outline: 'none',
                  cursor: 'pointer'
                },
                children: [/*#__PURE__*/_jsxDEV("option", {
                  value: "uploadedAt",
                  children: "Upload Time"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 444,
                  columnNumber: 19
                }, this), /*#__PURE__*/_jsxDEV("option", {
                  value: "name",
                  children: "Name"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 445,
                  columnNumber: 19
                }, this), /*#__PURE__*/_jsxDEV("option", {
                  value: "distance",
                  children: "Distance"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 446,
                  columnNumber: 19
                }, this), /*#__PURE__*/_jsxDEV("option", {
                  value: "gain",
                  children: "Elev. Gain"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 447,
                  columnNumber: 19
                }, this), /*#__PURE__*/_jsxDEV("option", {
                  value: "difficulty",
                  children: "Difficulty"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 448,
                  columnNumber: 19
                }, this)]
              }, void 0, true, {
                fileName: _jsxFileName,
                lineNumber: 435,
                columnNumber: 17
              }, this)]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 422,
              columnNumber: 15
            }, this), showFilters && /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  gap: 5,
                  flexWrap: 'wrap'
                },
                children: ['All', 'Easy', 'Moderate', 'Hard', 'Extreme'].map(d => /*#__PURE__*/_jsxDEV("button", {
                  onClick: () => setFilterDifficulty(d),
                  style: {
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filterDifficulty === d ? 'var(--accent-primary)' : 'rgba(249,115,22,0.08)',
                    color: filterDifficulty === d ? 'white' : 'var(--text-secondary)',
                    border: `1px solid ${filterDifficulty === d ? 'var(--accent-primary)' : 'var(--border)'}`
                  },
                  children: d
                }, d, false, {
                  fileName: _jsxFileName,
                  lineNumber: 455,
                  columnNumber: 23
                }, this))
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 453,
                columnNumber: 19
              }, this), /*#__PURE__*/_jsxDEV("select", {
                value: filterLocation,
                onChange: e => setFilterLocation(e.target.value),
                style: {
                  background: 'var(--bg-card)',
                  border: `1px solid var(--border)`,
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  outline: 'none',
                  cursor: 'pointer'
                },
                children: [/*#__PURE__*/_jsxDEV("option", {
                  value: "All",
                  children: "All Districts"
                }, void 0, false, {
                  fileName: _jsxFileName,
                  lineNumber: 471,
                  columnNumber: 21
                }, this), [...new Set(routes.map(r => r.district).filter(Boolean))].sort().map(dist => /*#__PURE__*/_jsxDEV("option", {
                  value: dist,
                  children: dist
                }, dist, false, {
                  fileName: _jsxFileName,
                  lineNumber: 473,
                  columnNumber: 23
                }, this))]
              }, void 0, true, {
                fileName: _jsxFileName,
                lineNumber: 463,
                columnNumber: 19
              }, this)]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 452,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 406,
            columnNumber: 13
          }, this), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 12,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              className: "section-label",
              children: [filteredRoutes.length, " of ", routes.length, " routes"]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 482,
              columnNumber: 15
            }, this), activeRoute && /*#__PURE__*/_jsxDEV("button", {
              onClick: () => setActiveRoute(null),
              style: {
                fontSize: 10,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              },
              children: [/*#__PURE__*/_jsxDEV(X, {
                size: 10
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 485,
                columnNumber: 19
              }, this), " Clear"]
            }, void 0, true, {
              fileName: _jsxFileName,
              lineNumber: 484,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 481,
            columnNumber: 13
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 335,
          columnNumber: 11
        }, this), /*#__PURE__*/_jsxDEV("div", {
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '0 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          },
          children: isLoading && routes.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 28,
                height: 28,
                border: `2px solid var(--accent-primary)`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px'
              }
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 495,
              columnNumber: 17
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                fontWeight: 500
              },
              children: "Loading..."
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 496,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 494,
            columnNumber: 15
          }, this) : filteredRoutes.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)'
            },
            children: [/*#__PURE__*/_jsxDEV(Compass, {
              size: 32,
              style: {
                marginBottom: 12,
                opacity: 0.4
              }
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 500,
              columnNumber: 17
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4
              },
              children: "No routes found"
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 501,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 499,
            columnNumber: 15
          }, this) : filteredRoutes.map(route => {
            const globalIdx = routes.findIndex(r => r.id === route.id);
            return /*#__PURE__*/_jsxDEV(RouteCard, {
              route: route,
              index: globalIdx,
              isActive: (activeRoute === null || activeRoute === void 0 ? void 0 : activeRoute.id) === route.id,
              onClick: () => handleRouteClick(route),
              onDelete: handleDeleteRoute
            }, route.id, false, {
              fileName: _jsxFileName,
              lineNumber: 507,
              columnNumber: 19
            }, this);
          })
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 492,
          columnNumber: 10
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 332,
        columnNumber: 9
      }, this)
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 321,
      columnNumber: 7
    }, this), /*#__PURE__*/_jsxDEV("div", {
      style: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden'
      },
      children: [!sidebarOpen && /*#__PURE__*/_jsxDEV("div", {
        style: {
          position: 'absolute',
          top: isMobile ? 12 : 16,
          left: isMobile ? 12 : 16,
          zIndex: 1000
        },
        children: /*#__PURE__*/_jsxDEV("div", {
          style: {
            padding: isMobile ? '6px 10px' : '8px 14px',
            background: 'var(--bg-primary)',
            border: `1px solid var(--border)`,
            borderRadius: 12,
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          },
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "theme-toggle",
            onClick: () => {
              setSidebarOpen(true);
              fireSidebarToggle();
            },
            title: "Open Sidebar",
            style: {
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)'
            },
            children: /*#__PURE__*/_jsxDEV(Menu, {
              size: 18
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 530,
              columnNumber: 9
            }, this)
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 529,
            columnNumber: 7
          }, this), /*#__PURE__*/_jsxDEV("img", {
            src: resolveAssetUrl('/logo.png'),
            alt: "Logo",
            style: {
              width: 32,
              height: 32,
              borderRadius: 6,
              objectFit: 'cover'
            }
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 532,
            columnNumber: 7
          }, this), /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'Playfair Display, serif'
            },
            children: "MAP MINE"
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 533,
            columnNumber: 7
          }, this), !isMobile && /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 11,
              color: 'var(--text-muted)'
            },
            children: ["\u2022 ", routes.length, " routes"]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 534,
            columnNumber: 21
          }, this), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginLeft: 4,
              flexShrink: 0
            },
            children: /*#__PURE__*/_jsxDEV("button", {
              className: "theme-toggle",
              onClick: toggleTheme,
              title: "Toggle theme",
              children: isDark ? /*#__PURE__*/_jsxDEV(Sun, {
                size: 14
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 537,
                columnNumber: 21
              }, this) : /*#__PURE__*/_jsxDEV(Moon, {
                size: 14
              }, void 0, false, {
                fileName: _jsxFileName,
                lineNumber: 537,
                columnNumber: 40
              }, this)
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 536,
              columnNumber: 9
            }, this)
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 535,
            columnNumber: 7
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 528,
          columnNumber: 5
        }, this)
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 527,
        columnNumber: 3
      }, this), /*#__PURE__*/_jsxDEV(MapView, {
        routes: filteredRoutes,
        activeRoute: activeRoute,
        onRouteClick: handleRouteClick,
        theme: theme,
        detailPanelHeight: activeRoute ? detailPanelHeight : 0
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 544,
        columnNumber: 9
      }, this), activeRoute && /*#__PURE__*/_jsxDEV(RouteDetail, {
        route: activeRoute,
        index: routes.findIndex(r => r.id === activeRoute.id),
        onClose: () => {
          setActiveRoute(null);
          setDetailPanelHeight(0);
        },
        onClick: () => handleRouteClick(activeRoute),
        isMobile: isMobile,
        onHeightChange: handleDetailPanelHeightChange
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 555,
        columnNumber: 11
      }, this)]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 523,
      columnNumber: 7
    }, this), isAuthModalOpen && /*#__PURE__*/_jsxDEV("div", {
      role: "presentation",
      onClick: () => setIsAuthModalOpen(false),
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(4px)'
      },
      children: /*#__PURE__*/_jsxDEV("div", {
        onClick: event => event.stopPropagation(),
        style: {
          width: 'min(100%, 420px)',
          padding: 24,
          borderRadius: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text-primary)'
              },
              children: "Sign in to Contribute"
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 578,
              columnNumber: 11
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 5,
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--text-muted)'
              },
              children: "Sign in with Google to add trails to the map."
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 579,
              columnNumber: 11
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 577,
            columnNumber: 9
          }, this), /*#__PURE__*/_jsxDEV("button", {
            onClick: () => setIsAuthModalOpen(false),
            style: {
              display: 'flex',
              padding: 5,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            },
            children: /*#__PURE__*/_jsxDEV(X, {
              size: 18
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 582,
              columnNumber: 11
            }, this)
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 581,
            columnNumber: 9
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 576,
          columnNumber: 7
        }, this), /*#__PURE__*/_jsxDEV("input", {
          type: "text",
          placeholder: "Your name",
          value: authModalName,
          onChange: e => setAuthModalName(e.target.value),
          style: {
            width: '100%',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box'
          }
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 586,
          columnNumber: 7
        }, this), /*#__PURE__*/_jsxDEV("button", {
          onClick: handleGoogleSignIn,
          disabled: !authModalName.trim(),
          style: {
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            background: 'var(--accent-primary)',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            cursor: authModalName.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: authModalName.trim() ? 1 : 0.5
          },
          children: "Sign in with Google"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 605,
          columnNumber: 7
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 572,
        columnNumber: 5
      }, this)
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 567,
      columnNumber: 3
    }, this), isContributionOpen && /*#__PURE__*/_jsxDEV("div", {
      role: "presentation",
      onClick: () => setIsContributionOpen(false),
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(4px)'
      },
      children: /*#__PURE__*/_jsxDEV("form", {
        onSubmit: handleContribute,
        onClick: event => event.stopPropagation(),
        style: {
          width: 'min(100%, 420px)',
          padding: 24,
          borderRadius: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text-primary)'
              },
              children: "Contribute a map"
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 643,
              columnNumber: 17
            }, this), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 5,
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--text-muted)'
              },
              children: "Save GPX, KML, or JSON data in the shared library."
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 644,
              columnNumber: 17
            }, this)]
          }, void 0, true, {
            fileName: _jsxFileName,
            lineNumber: 642,
            columnNumber: 15
          }, this), /*#__PURE__*/_jsxDEV("button", {
            type: "button",
            onClick: () => setIsContributionOpen(false),
            "aria-label": "Close contribution dialog",
            style: {
              display: 'flex',
              padding: 5,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            },
            children: /*#__PURE__*/_jsxDEV(X, {
              size: 18
            }, void 0, false, {
              fileName: _jsxFileName,
              lineNumber: 647,
              columnNumber: 17
            }, this)
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 646,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 641,
          columnNumber: 13
        }, this), /*#__PURE__*/_jsxDEV("label", {
          style: {
            display: 'block',
            marginBottom: 14
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            style: {
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-secondary)'
            },
            children: "Trail name"
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 652,
            columnNumber: 15
          }, this), /*#__PURE__*/_jsxDEV("input", {
            autoFocus: true,
            value: contributionName,
            onChange: event => setContributionName(event.target.value),
            placeholder: "e.g. Shivapuri sunrise loop",
            style: {
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 11px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none'
            }
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 653,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 651,
          columnNumber: 13
        }, this), /*#__PURE__*/_jsxDEV("label", {
          style: {
            display: 'block',
            marginBottom: 14
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            style: {
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-secondary)'
            },
            children: "Route file"
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 663,
            columnNumber: 15
          }, this), /*#__PURE__*/_jsxDEV("input", {
            type: "file",
            accept: ".gpx,.kml,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/json",
            onChange: handleContributionFile,
            style: {
              width: '100%',
              color: 'var(--text-secondary)',
              fontSize: 12
            }
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 664,
            columnNumber: 15
          }, this), contributionFile && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 6,
              fontSize: 11,
              color: 'var(--accent-primary)'
            },
            children: contributionFile.name
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 665,
            columnNumber: 36
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 662,
          columnNumber: 13
        }, this), contributionError && /*#__PURE__*/_jsxDEV("div", {
          role: "alert",
          style: {
            marginBottom: 14,
            padding: '8px 10px',
            borderRadius: 7,
            background: 'rgba(239,68,68,0.1)',
            color: '#ef4444',
            fontSize: 11
          },
          children: contributionError
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 668,
          columnNumber: 35
        }, this), /*#__PURE__*/_jsxDEV("button", {
          type: "submit",
          disabled: isContributing,
          style: {
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            background: 'var(--accent-primary)',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            cursor: isContributing ? 'wait' : 'pointer',
            opacity: isContributing ? 0.7 : 1
          },
          children: isContributing ? 'Saving route…' : 'Save trail for everyone'
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 670,
          columnNumber: 13
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 636,
        columnNumber: 11
      }, this)
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 631,
      columnNumber: 9
    }, this)]
  }, void 0, true, {
    fileName: _jsxFileName,
    lineNumber: 318,
    columnNumber: 5
  }, this);
}
_s(App, "O6I47mR177FLNTENhUMp+Ha8Ygo=");
_c = App;
function MicroStat({
  label,
  value
}) {
  return /*#__PURE__*/_jsxDEV("div", {
    style: {
      background: 'var(--bg-card)',
      borderRadius: 8,
      padding: '8px',
      textAlign: 'center',
      border: `1px solid var(--border)`
    },
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--accent-primary)',
        fontFamily: 'JetBrains Mono, monospace'
      },
      children: value
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 683,
      columnNumber: 7
    }, this), /*#__PURE__*/_jsxDEV("div", {
      className: "section-label",
      style: {
        marginTop: 2
      },
      children: label
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 684,
      columnNumber: 7
    }, this)]
  }, void 0, true, {
    fileName: _jsxFileName,
    lineNumber: 682,
    columnNumber: 5
  }, this);
}
_c2 = MicroStat;
function LoadingStatus({
  state,
  onReload
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') {
    return /*#__PURE__*/_jsxDEV("div", {
      style: {
        marginTop: 12
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6
        },
        children: [/*#__PURE__*/_jsxDEV("span", {
          style: {
            fontSize: 11,
            color: 'var(--text-muted)'
          },
          children: ["Loading routes\u2026 ", state.loaded, "/", state.total]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 696,
          columnNumber: 11
        }, this), /*#__PURE__*/_jsxDEV("span", {
          style: {
            fontSize: 11,
            color: 'var(--accent-primary)',
            fontFamily: 'JetBrains Mono, monospace'
          },
          children: [state.progress, "%"]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 699,
          columnNumber: 11
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 695,
        columnNumber: 9
      }, this), /*#__PURE__*/_jsxDEV("div", {
        className: "loading-bar-track",
        children: /*#__PURE__*/_jsxDEV("div", {
          className: "loading-bar-fill",
          style: {
            width: `${state.progress}%`
          }
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 702,
          columnNumber: 11
        }, this)
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 701,
        columnNumber: 9
      }, this)]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 694,
      columnNumber: 7
    }, this);
  }
  if (state.status === 'error') {
    return /*#__PURE__*/_jsxDEV("div", {
      style: {
        marginTop: 12,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.25)'
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          fontSize: 11,
          color: '#ef4444',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        },
        children: [/*#__PURE__*/_jsxDEV(AlertTriangle, {
          size: 12
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 711,
          columnNumber: 115
        }, this), " Failed to load KML files"]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 711,
        columnNumber: 9
      }, this), /*#__PURE__*/_jsxDEV("div", {
        style: {
          fontSize: 10,
          color: 'var(--text-muted)'
        },
        children: state.errors[0]
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 712,
        columnNumber: 9
      }, this), /*#__PURE__*/_jsxDEV("button", {
        onClick: onReload,
        style: {
          marginTop: 6,
          fontSize: 10,
          color: 'var(--accent-primary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        },
        children: [/*#__PURE__*/_jsxDEV(RefreshCw, {
          size: 10
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 714,
          columnNumber: 11
        }, this), " Retry"]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 713,
        columnNumber: 9
      }, this)]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 710,
      columnNumber: 7
    }, this);
  }
  if (state.status === 'done' && state.errors.length > 0) {
    return /*#__PURE__*/_jsxDEV("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      },
      children: [/*#__PURE__*/_jsxDEV("span", {
        style: {
          fontSize: 10,
          color: 'var(--text-muted)'
        },
        children: [state.loaded, " loaded", state.errors.length > 0 ? `, ${state.errors.length} failed` : '']
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 723,
        columnNumber: 9
      }, this), /*#__PURE__*/_jsxDEV("button", {
        onClick: onReload,
        style: {
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3
        },
        children: [/*#__PURE__*/_jsxDEV(RefreshCw, {
          size: 10
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 727,
          columnNumber: 11
        }, this), " Reload"]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 726,
        columnNumber: 9
      }, this)]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 722,
      columnNumber: 7
    }, this);
  }
  return /*#__PURE__*/_jsxDEV("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end'
    },
    children: /*#__PURE__*/_jsxDEV("button", {
      onClick: onReload,
      style: {
        fontSize: 10,
        color: 'var(--text-muted)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3
      },
      children: [/*#__PURE__*/_jsxDEV(RefreshCw, {
        size: 10
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 736,
        columnNumber: 9
      }, this), " Reload"]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 735,
      columnNumber: 7
    }, this)
  }, void 0, false, {
    fileName: _jsxFileName,
    lineNumber: 734,
    columnNumber: 5
  }, this);
}
_c3 = LoadingStatus;
var _c, _c2, _c3;
$RefreshReg$(_c, "App");
$RefreshReg$(_c2, "MicroStat");
$RefreshReg$(_c3, "LoadingStatus");
