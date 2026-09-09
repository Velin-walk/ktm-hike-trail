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

export { resolveAssetUrl };

// Notify the map whenever sidebar toggles
const fireSidebarToggle = () => {
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 50);
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 200);
  setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 400);
};



export default function App() {
  const [routes, setRoutes] = useState([]);
  const [activeRoute, setActiveRoute] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [sortBy, setSortBy] = useState('uploadedAt');
  const [showFilters, setShowFilters] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ht-theme') || 'day');
  const [loadingState, setLoadingState] = useState({ status: 'idle', progress: 0, total: 0, loaded: 0, errors: [] });
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
  const [profileOpen, setProfileOpen] = useState(false);



  // When a route is activated, pre-calculate the default panel height
  const handleDetailPanelHeightChange = (h) => setDetailPanelHeight(h);
  
  const hasAutoLoadedRoute = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

useEffect(() => {
  if (!auth) return undefined;

  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
    setLoadingState({ status: 'loading', progress: 0, total: 0, loaded: 0, errors: [] });
    setRoutes([]);

    try {
      const manifestRes = await fetch(`${resolveAssetUrl('/kml/routes-metadata.json')}?t=${Date.now()}`);
      if (!manifestRes.ok) throw new Error('routes-metadata.json not found in /public/kml/');
      const metadataMap = await manifestRes.json();
      const fileNames = Object.keys(metadataMap);

      if (fileNames.length === 0) {
        setLoadingState({ status: 'done', progress: 100, total: 0, loaded: 0, errors: ['No KML files listed in routes-metadata.json'] });
        return;
      }

      const loadedRoutes = Object.entries(metadataMap).map(([fileName, meta]) => {
        return {
          id: Math.random().toString(36).substr(2, 9),
          fileName: fileName,
          name: meta.name,
          description: meta.description,
          difficulty: meta.difficultyOverride !== "Auto" ? meta.difficultyOverride : meta.calculatedDifficulty,
          stats: {
             ...meta.stats,
             estimatedHours: meta.hoursOverride !== "Auto" ? meta.hoursOverride : meta.stats?.estimatedHours
          },
          province: meta.province || '',
          district: meta.district || '',
          nearbyCity: meta.nearbyCity || '',
          highlights: meta.highlights || '',
          uploadedAt: meta.uploadedAt || '',
          contributorEmail: meta.contributorEmail || '',
          contributorName: meta.contributorName || '',
          contributorUid: meta.contributorUid || '',
          bounds: meta.bounds,
          coordinates: meta.startPos ? [meta.startPos, meta.startPos] : [], 
          isLazyLoaded: false
        };
      });

      setRoutes(loadedRoutes);
      setLoadingState({ status: 'done', progress: 100, total: loadedRoutes.length, loaded: loadedRoutes.length, errors: [] });
    } catch (e) {
      setLoadingState({ status: 'error', progress: 0, total: 0, loaded: 0, errors: [e.message] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadKMLFolder();
    }
  }, [user, loadKMLFolder]);

  const handleRouteClick = useCallback(async (route) => {
      localStorage.setItem(`route-viewed-${route.id}`, Date.now().toString());

    // On mobile, hide the sidebar so the map + elevation card are visible
    if (isMobile) { setSidebarOpen(false); fireSidebarToggle(); }

    // IMMEDIATE FEEDBACK: Highlight card and open panel instantly
    const routeWithLoadingState = { ...route, loadError: null };
    setActiveRoute(routeWithLoadingState);
    setRoutes(prev => prev.map(r => r.id === route.id ? routeWithLoadingState : r));

    if (!route.isLazyLoaded) {
      try {
        const res = await fetch(`${resolveAssetUrl(`/kml/${encodeURIComponent(route.fileName)}`)}?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${route.fileName}`);
        const text = await res.text();
        
        // Yield to the browser to let the UI slide-up animation run smoothly
        // before blocking the main thread with heavy KML parsing
        await new Promise(resolve => setTimeout(resolve, 350));
        
        const routeExtension = (route.fileName || '').split('.').pop()?.toLowerCase();
        const parser = routeExtension === 'gpx' ? parseGPX : parseKML;
        const fullParsed = parser(text, route.fileName);
        if (!fullParsed) throw new Error(`${routeExtension?.toUpperCase() || 'Route'} file has no valid route geometry`);
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
            loadError: null,
          };
          updatedRoute.stats.estimatedHours = route.stats.estimatedHours;
          setRoutes(prev => prev.map(r => r.id === route.id ? updatedRoute : r));
          setActiveRoute(updatedRoute);
        }
      } catch (err) {
        console.error('Failed to load KML', err);
        const failedRoute = {
          ...route,
          loadError: err?.message || 'Failed to parse KML file',
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
          window.history.replaceState({ path: newUrl }, '', newUrl);
        }
      }
    }
  }, [loadingState.status, routes, handleRouteClick]);

  const handleDeleteRoute = useCallback((id) => {
    setRoutes(prev => prev.filter(r => r.id !== id));
    setActiveRoute(prev => (prev?.id === id ? null : prev));
  }, []);

  const handleContributionFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['gpx', 'kml', 'json'].includes(extension)) {
      setContributionFile(null);
      setContributionError('Choose a GPX, KML, or JSON file.');
      return;
    }
    setContributionFile(file);
    setContributionError('');
  };

  const handleContribute = async (event) => {
    event.preventDefault();
    if (!contributionFile || !contributionName.trim()) {
      setContributionError('Add a trail name and choose a GPX or KML file.');
      return;
    }

    setIsContributing(true);
    try {
      const fileText = await contributionFile.text();
      const extension = contributionFile.name.split('.').pop()?.toLowerCase();
      if (extension === 'json') {
        JSON.parse(fileText);
      } else {
        const parsedRoute = extension === 'gpx'
          ? parseGPX(fileText, contributionFile.name, contributionName)
          : parseKML(fileText, contributionFile.name, contributionName);
        if (!parsedRoute) throw new Error('No route points were found in that file.');
      }

      const contributorDisplayName = authModalName.trim() || user?.displayName || user?.email || contributionName.trim();
      const formData = new FormData();
      formData.append('name', contributionName.trim());
      formData.append('file', contributionFile);
      formData.append('email', user?.email || '');
      formData.append('contributorName', contributorDisplayName);
      formData.append('contributorUid', user?.uid || '');
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(response.status === 404
          ? 'Upload API not found. Start the Express server with "node server.js" and restart the React app.'
          : 'Upload API returned an invalid response. Check that the Express server is running.');
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
  try {
    await signInWithPopup(auth, googleProvider);
    localStorage.setItem('userName', user?.displayName || user?.email || '');
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

const filteredRoutes = routes
  .filter(r => {
    const matchSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (r.province && r.province.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (r.highlights && r.highlights.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchDiff = filterDifficulty === 'All' || r.difficulty === filterDifficulty;
    const matchLoc = filterLocation === 'All' || r.district === filterLocation;
    return matchSearch && matchDiff && matchLoc;
  })
  .sort((a, b) => {
    if (sortBy === 'distance') return b.stats.distance - a.stats.distance;
    if (sortBy === 'gain') return b.stats.elevationGain - a.stats.elevationGain;
    if (sortBy === 'difficulty') { 
      const o = {Easy:0, Moderate:1, Hard:2, Extreme:3}; 
      return o[b.difficulty] - o[a.difficulty]; 
    }
    if (sortBy === 'uploadedAt') {
      return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
    }
    return a.name.localeCompare(b.name);
  });

  const totalStats = routes.reduce((acc, r) => ({
    distance: acc.distance + (r.stats?.distance || 0),
    gain: acc.gain + (r.stats?.elevationGain || 0),
  }), { distance: 0, gain: 0 });

  const myContributedRoutes = user ? routes.filter(r => {
    const sameUid = !!user.uid && !!r.contributorUid && r.contributorUid === user.uid;
    const sameEmail = !!user.email && !!r.contributorEmail && r.contributorEmail.toLowerCase() === user.email.toLowerCase();
    return sameUid || sameEmail;
  }) : [];

  const isDark = theme === 'dark';

  if (!user) {
    return (
      <div style={{
        minHeight:'100vh',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        background:'linear-gradient(135deg, var(--bg-primary), var(--bg-secondary))',
        padding:24,
      }}>
        <div style={{
          width:'min(100%, 420px)',
          background:'var(--bg-card)',
          border:'1px solid var(--border)',
          borderRadius:18,
          padding:28,
          boxShadow:'0 20px 60px rgba(0,0,0,0.18)',
          textAlign:'center',
        }}>
          <img src={resolveAssetUrl('/logo.png')} alt="Logo" style={{ width:64, height:64, borderRadius:16, marginBottom:16 }} />
          <div style={{ fontSize:24, fontWeight:800, color:'var(--text-primary)', marginBottom:8 }}>MAP MINERS</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20, lineHeight:1.6 }}>
            Sign in to access the trail map and contribute routes.
          </div>
          <button
            onClick={handleGoogleSignIn}
            style={{
              width:'100%',
              padding:'12px 16px',
              border:'none',
              borderRadius:10,
              background:'var(--accent-primary)',
              color:'#ffffff',
              fontSize:14,
              fontWeight:700,
              cursor:'pointer',
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-primary)', position: 'relative' }}>

      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? (isMobile ? '100%' : 425) : 0,
minWidth: sidebarOpen ? (isMobile ? '100%' : 425) : 0,
        overflow:'hidden', transition:'all 0.35s cubic-bezier(0.4,0,0.2,1)',
        display:'flex', flexDirection:'column',
        background:'var(--sidebar-bg)',
        borderRight:`1px solid var(--sidebar-border)`,
        position: isMobile ? 'absolute' : 'relative',
        height: '100%',
        zIndex: 2000,
      }}>
        <div style={{ width: isMobile ? '100%' : 425, display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'20px 20px 0', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              {/* Sidebar toggle */}
              <button className="theme-toggle" onClick={() => { setSidebarOpen(false); fireSidebarToggle(); }} title="Close Sidebar" style={{ border: 'none', background: 'transparent' }}>
                <Menu size={18} />
              </button>
             {/* Logo */}
<div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
  <img src={resolveAssetUrl('/logo.png')} alt="Logo" style={{ width:48, height:48, borderRadius:10, flexShrink:0, objectFit:'cover' }} />
  <div style={{ minWidth:0 }}>
    <div style={{ fontSize:16, fontWeight:800, color:'var(--text-primary)', fontFamily:'Montserrat, serif', letterSpacing:'-0.02em', lineHeight:1 }}>MAP MINERS</div>
    <a 
      href="https://www.walknepalwalk.com.np/trail-maps" 
      target="_blank" 
      rel="noopener noreferrer"
      style={{ display:'block', fontSize:9, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'lowercase', fontWeight:600, textDecoration:'none', transition:'color 0.2s', marginTop:2 }}
      onMouseEnter={e => e.target.style.color='var(--accent-primary)'}
      onMouseLeave={e => e.target.style.color='var(--text-muted)'}
    >
      CONTRIBUTION based Community Data
    </a>
  </div>
</div>

              {/* Top Right: User Profile & Theme Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 'auto' }}>
                {user && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.displayName || user.email}
                    </span>
                    <button 
                      onClick={handleSignOut} 
                      style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}
                      onMouseEnter={e => e.target.style.color = '#ef4444'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
                    >
                      Sign out
                    </button>
                  </div>
                )}

                <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to Day Mode' : 'Switch to Dark Mode'}>
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </div>

            {/* Loading state */}
            <LoadingStatus state={loadingState} onReload={loadKMLFolder} />

            {/* "My maps" and "Contribute map" side by side */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => {
                  if (!user) {
                    setIsAuthModalOpen(true);
                  } else {
                    setProfileOpen(v => !v);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  border: '1px solid var(--accent-primary)',
                  borderRadius: 8,
                  background: profileOpen ? 'rgba(249,115,22,0.22)' : 'rgba(249,115,22,0.1)',
                  color: 'var(--accent-primary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <Compass size={14} /> My maps {user && myContributedRoutes.length > 0 ? `(${myContributedRoutes.length})` : ''}
              </button>

              <button
                onClick={() => {
                  if (!user) {
                    setIsAuthModalOpen(true);
                  } else {
                    setIsContributionOpen(true);
                    setContributionError('');
                  }
                }}
                style={{
                  flex: 1,
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
                  cursor: 'pointer',
                }}
              >
                <Upload size={14} /> Contribute map
              </button>
            </div>

            {user && profileOpen && (
              <div style={{ marginTop:12, padding:10, border:`1px solid var(--border)`, borderRadius:10, background:'var(--bg-card)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>My maps</div>
                  <span style={{ fontSize:10, color:'var(--text-muted)' }}>{myContributedRoutes.length}</span>
                </div>

                {myContributedRoutes.length === 0 ? (
                  <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5 }}>No maps contributed yet.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {myContributedRoutes.slice(0, 6).map(route => (
                      <button
                        key={route.id}
                        onClick={() => handleRouteClick(route)}
                        style={{
                          width:'100%', textAlign:'left', padding:'7px 8px', borderRadius:8,
                          border:'1px solid var(--border)', background:'var(--bg-secondary)',
                          color:'var(--text-primary)', cursor:'pointer', display:'flex', justifyContent:'space-between', gap:8,
                        }}
                      >
                        <span style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{route.name}</span>
                        <span style={{ fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{route.stats?.distance ?? 0}km</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Search */}
            <div style={{ marginTop:12 }}>
              <div style={{ position:'relative', marginBottom:8 }}>
                <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search route"
                  style={{
                    width:'100%', background:'var(--input-bg)', border:`1px solid var(--border)`,
                    borderRadius:8, padding:'8px 10px 8px 30px',
                    color:'var(--text-primary)', fontSize:12, outline:'none',
                  }}
                  onFocus={e => e.target.style.borderColor='var(--accent-primary)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'}
                />
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  style={{
                    display:'flex', alignItems:'center', gap:4, padding:'5px 10px',
                    background: showFilters ? 'rgba(249,115,22,0.15)' : 'var(--bg-card)',
                    border:`1px solid ${showFilters ? 'var(--accent-primary)' : 'var(--border)'}`,
                    borderRadius:6, cursor:'pointer',
                    color: showFilters ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize:11,
                  }}>
                  <Filter size={11} /> Filter
                </button>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{
                    flex:1, background:'var(--bg-card)', border:`1px solid var(--border)`,
                    borderRadius:6, padding:'5px 8px', color:'var(--text-secondary)',
                    fontSize: 11, outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="uploadedAt">Upload Time</option>
                  <option value="name">Name</option>
                  <option value="distance">Distance</option>
                  <option value="gain">Elev. Gain</option>
                  <option value="difficulty">Difficulty</option>
                </select>
              </div>
              {showFilters && (
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {['All','Easy','Moderate','Hard','Extreme'].map(d => (
                      <button key={d} onClick={() => setFilterDifficulty(d)} style={{
                        padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:600, cursor:'pointer',
                        background: filterDifficulty===d ? 'var(--accent-primary)' : 'rgba(249,115,22,0.08)',
                        color: filterDifficulty===d ? 'white' : 'var(--text-secondary)',
                        border:`1px solid ${filterDifficulty===d ? 'var(--accent-primary)' : 'var(--border)'}`,
                      }}>{d}</button>
                    ))}
                  </div>
                  <select
                    value={filterLocation}
                    onChange={e => setFilterLocation(e.target.value)}
                    style={{
                      background:'var(--bg-card)', border:`1px solid var(--border)`,
                      borderRadius:6, padding:'5px 8px', color:'var(--text-secondary)',
                      fontSize:11, outline:'none', cursor:'pointer',
                    }}>
                    <option value="All">All Districts</option>
                    {[...new Set(routes.map(r => r.district).filter(Boolean))].sort().map(dist => (
                      <option key={dist} value={dist}>{dist}</option>
                    ))}
                  </select>

                </div>
              )}
            </div>

            <div style={{ marginTop:12, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span className="section-label">{filteredRoutes.length} of {routes.length} routes</span>
              {activeRoute && (
                <button onClick={() => setActiveRoute(null)} style={{ fontSize:10, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                  <X size={10}/> Clear
                </button>
              )}
            </div>
          </div>

          {/* Route list */}
         <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:8 }}>
            {isLoading && routes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text-muted)' }}>
                <div style={{ width:28, height:28, border:`2px solid var(--accent-primary)`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
                <div style={{ fontSize:13, fontWeight:500 }}>Loading...</div>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text-muted)' }}>
                <Compass size={32} style={{ marginBottom:12, opacity:0.4 }} />
                <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>No routes found</div>
              </div>
            ) : (
              filteredRoutes.map(route => {
                const globalIdx = routes.findIndex(r => r.id === route.id);
                return (
                  <RouteCard
                    key={route.id}
                    route={route}
                    index={globalIdx}
                    isActive={activeRoute?.id === route.id}
                    onClick={() => handleRouteClick(route)}
                    onDelete={handleDeleteRoute}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

        {/* Floating logo when sidebar closed */}
{!sidebarOpen && (
  <div style={{ position:'absolute', top: isMobile ? 12 : 16, left: isMobile ? 12 : 16, zIndex:1000 }}>
    <div style={{ padding: isMobile ? '6px 10px' : '8px 14px', background:'var(--bg-primary)', border:`1px solid var(--border)`, borderRadius:12, backdropFilter:'blur(12px)', display:'flex', alignItems:'center', gap:8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <button className="theme-toggle" onClick={() => { setSidebarOpen(true); fireSidebarToggle(); }} title="Open Sidebar" style={{ border:'none', background:'transparent', color: 'var(--text-primary)' }}>
        <Menu size={18}/>
      </button>
      <img src={resolveAssetUrl('/logo.png')} alt="Logo" style={{ width:32, height:32, borderRadius:6, objectFit:'cover' }} />
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:'Playfair Display, serif' }}>MAP MINERS</span>
      {!isMobile && <span style={{ fontSize:11, color:'var(--text-muted)' }}>â€¢ {routes.length} routes</span>}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft:4, flexShrink:0 }}>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {isDark ? <Sun size={14}/> : <Moon size={14}/>}
        </button>
      </div>
    </div>
  </div>
)}

        <MapView
          routes={filteredRoutes}
          activeRoute={activeRoute}
          onRouteClick={handleRouteClick}
          theme={theme}
          detailPanelHeight={activeRoute ? detailPanelHeight : 0}
        />

        {/* Route legend removed */}

        {activeRoute && (
          <RouteDetail
            route={activeRoute}
            index={routes.findIndex(r => r.id === activeRoute.id)}
            onClose={() => { setActiveRoute(null); setDetailPanelHeight(0); }}
            onClick={() => handleRouteClick(activeRoute)}
            isMobile={isMobile}
            onHeightChange={handleDetailPanelHeightChange}
          />
        )}
      </div>

{isAuthModalOpen && (
  <div
    role="presentation"
    onClick={() => setIsAuthModalOpen(false)}
    style={{ position:'fixed', inset:0, zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}
  >
    <div
      onClick={event => event.stopPropagation()}
      style={{ width:'min(100%, 420px)', padding:24, borderRadius:14, background:'var(--bg-card)', border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
    >
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:18 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)' }}>Sign in to Contribute</div>
          <div style={{ marginTop:5, fontSize:11, lineHeight:1.5, color:'var(--text-muted)' }}>Sign in with Google to add trails to the map.</div>
        </div>
        <button onClick={() => setIsAuthModalOpen(false)} style={{ display:'flex', padding:5, border:'none', background:'transparent', color:'var(--text-muted)', cursor:'pointer' }}>
          <X size={18} />
        </button>
      </div>

      <input
        type="text"
        placeholder="Your name"
        value={authModalName}
        onChange={(e) => setAuthModalName(e.target.value)}
        style={{
          width:'100%',
          padding:'10px 12px',
          marginBottom:12,
          borderRadius:8,
          border:'1px solid var(--border)',
          background:'var(--input-bg)',
          color:'var(--text-primary)',
          fontSize:12,
          outline:'none',
          boxSizing:'border-box'
        }}
      />

      <button 
        onClick={handleGoogleSignIn}
        disabled={!authModalName.trim()}
        style={{ 
          width:'100%', 
          padding:'10px 12px', 
          border:'none', 
          borderRadius:8, 
          background:'var(--accent-primary)', 
          color:'white', 
          fontSize:12, 
          fontWeight:700, 
          cursor: authModalName.trim() ? 'pointer' : 'not-allowed',
          display:'flex', 
          alignItems:'center', 
          justifyContent:'center', 
          gap:8,
          opacity: authModalName.trim() ? 1 : 0.5
        }}>
        Sign in with Google
      </button>
    </div>
  </div>
)}

      {isContributionOpen && (
        <div
          role="presentation"
          onClick={() => setIsContributionOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)' }}
        >
          <form
            onSubmit={handleContribute}
            onClick={event => event.stopPropagation()}
            style={{ width:'min(100%, 420px)', padding:24, borderRadius:14, background:'var(--bg-card)', border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
          >
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:18 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)' }}>Contribute a map</div>
                <div style={{ marginTop:5, fontSize:11, lineHeight:1.5, color:'var(--text-muted)' }}>Save GPX, KML, or JSON data in the shared library.</div>
              </div>
              <button type="button" onClick={() => setIsContributionOpen(false)} aria-label="Close contribution dialog" style={{ display:'flex', padding:5, border:'none', background:'transparent', color:'var(--text-muted)', cursor:'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <label style={{ display:'block', marginBottom:14 }}>
              <span style={{ display:'block', marginBottom:6, fontSize:11, fontWeight:700, color:'var(--text-secondary)' }}>Trail name</span>
              <input
                autoFocus
                value={contributionName}
                onChange={event => setContributionName(event.target.value)}
                placeholder="e.g. Shivapuri sunrise loop"
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 11px', border:'1px solid var(--border)', borderRadius:8, background:'var(--input-bg)', color:'var(--text-primary)', fontSize:13, outline:'none' }}
              />
            </label>

            <label style={{ display:'block', marginBottom:14 }}>
              <span style={{ display:'block', marginBottom:6, fontSize:11, fontWeight:700, color:'var(--text-secondary)' }}>Route file</span>
              <input type="file" accept=".gpx,.kml,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/json" onChange={handleContributionFile} style={{ width:'100%', color:'var(--text-secondary)', fontSize:12 }} />
              {contributionFile && <div style={{ marginTop:6, fontSize:11, color:'var(--accent-primary)' }}>{contributionFile.name}</div>}
            </label>

            {contributionError && <div role="alert" style={{ marginBottom:14, padding:'8px 10px', borderRadius:7, background:'rgba(239,68,68,0.1)', color:'#ef4444', fontSize:11 }}>{contributionError}</div>}

            <button type="submit" disabled={isContributing} style={{ width:'100%', padding:'10px 12px', border:'none', borderRadius:8, background:'var(--accent-primary)', color:'white', fontSize:12, fontWeight:700, cursor:isContributing ? 'wait' : 'pointer', opacity:isContributing ? 0.7 : 1 }}>
              {isContributing ? 'Saving routeâ€¦' : 'Save trail for everyone'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MicroStat({ label, value }) {
  return (
    <div style={{ background:'var(--bg-card)', borderRadius:8, padding:'8px', textAlign:'center', border:`1px solid var(--border)` }}>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--accent-primary)', fontFamily:'JetBrains Mono, monospace' }}>{value}</div>
      <div className="section-label" style={{ marginTop:2 }}>{label}</div>
    </div>
  );
}

function LoadingStatus({ state, onReload }) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div style={{ marginTop:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>
            Loading routesâ€¦ {state.loaded}/{state.total}
          </span>
          <span style={{ fontSize:11, color:'var(--accent-primary)', fontFamily:'JetBrains Mono, monospace' }}>{state.progress}%</span>
        </div>
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ width:`${state.progress}%` }} />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ fontSize:11, color:'#ef4444', marginBottom:4, display:'flex', alignItems:'center', gap:4 }}><AlertTriangle size={12} /> Failed to load KML files</div>
        <div style={{ fontSize:10, color:'var(--text-muted)' }}>{state.errors[0]}</div>
        <button onClick={onReload} style={{ marginTop:6, fontSize:10, color:'var(--accent-primary)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
          <RefreshCw size={10}/> Retry
        </button>
      </div>
    );
  }

  if (state.status === 'done' && state.errors.length > 0) {
    return (
      <div style={{ marginTop:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>
          {state.loaded} loaded{state.errors.length > 0 ? `, ${state.errors.length} failed` : ''}
        </span>
        <button onClick={onReload} style={{ fontSize:10, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
          <RefreshCw size={10}/> Reload
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop:10, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
      <button onClick={onReload} style={{ fontSize:10, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
        <RefreshCw size={10}/> Reload
      </button>
    </div>
  );
}
