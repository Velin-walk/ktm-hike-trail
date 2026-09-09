import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Mountain, TrendingUp, TrendingDown, Clock, Download, MapPin, Flag, Star, Share2, Check } from 'lucide-react';
import ElevationChart from './ElevationChart';
import { routeToGPX } from '../utils/kmlParser';
import { resolveAssetUrl } from '../utils/assetUrl';

const ROUTE_COLORS = [
  '#f92916', 
];

const DIFF_COLORS = {
  Easy: '#f92916'};

const MIN_HEIGHT = 80;
const MAX_HEIGHT_VH = 85;

const ACTIVE_ROUTE_FALLBACK_IMAGE = resolveAssetUrl('/images/20260509_123225.jpg');

function formatEstimatedTime(hours) {
  if (typeof hours !== 'number' || Number.isNaN(hours)) return '-';
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `~${h}h`;
  return `~${h}h ${m}m`;
}

function buildAboutParagraphs(text) {
  if (!text) return [];
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^.!?]+[.!?]?/g) || [text.trim()];

  const paragraphs = [];
  for (let i = 0; i < sentences.length && paragraphs.length < 3; i += 2) {
    paragraphs.push(`${(sentences[i] || '').trim()} ${(sentences[i + 1] || '').trim()}`.trim());
  }
  return paragraphs.filter(Boolean);
}

function getHighlights(route) {
  const chips = [];
  const difficulty = String(route?.difficulty || '').toLowerCase();
  const text = `${route?.description || ''} ${route?.highlights || ''}`.toLowerCase();

  if (difficulty === 'easy' || difficulty === 'moderate') chips.push('Beginner Friendly');
  if (text.includes('family') || text.includes('kids')) chips.push('Family Friendly');
  if (text.includes('transport') || text.includes('bus') || text.includes('jeep') || text.includes('crowd')) {
    chips.push('Transport wait at end');
  }
  if (chips.length === 0 && (route?.stats?.distance || 0) <= 15) chips.push('Great for Half-day Hike');

  return chips.slice(0, 3);
}

export default function RouteDetail({ route, index, onClose, isMobile, onHeightChange }) {
  const [panelHeight, setPanelHeight] = useState(null);
  const [isHandleHovered, setIsHandleHovered] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const isDraggingRef = useRef(false);
  const swipeStartXRef = useRef(null);
  const swipeStartYRef = useRef(null);
  const mouseSwipeStartXRef = useRef(null);
  const mouseSwipeStartYRef = useRef(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const panelRef = useRef(null);
  const handleBarRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const [showChartDeferred, setShowChartDeferred] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const heroImage = route?.heroImage || route?.image || route?.photo || ACTIVE_ROUTE_FALLBACK_IMAGE;
  const hasAbout = Boolean(route?.description?.trim());
  const hasWaypointLinks = Boolean(route?.isLazyLoaded && route?.waypoints?.length >= 2);

  const defaultHeightVh = currentPage === 0
    ? (isMobile ? 42 : 38)
    : currentPage === 1
      ? (isMobile ? 40 : 52)
      : hasAbout
        ? (isMobile ? 58 : 68)
        : hasWaypointLinks
          ? (isMobile ? 46 : 52)
          : (isMobile ? 38 : 42);

  useEffect(() => {
    // Trigger entrance animation on mount
    requestAnimationFrame(() => {
      setIsMounted(true);
      // Defer heavy chart rendering to avoid jank during entrance
      setTimeout(() => setShowChartDeferred(true), 150);
      // Remove transform after animation completes to fix blurry text
      setTimeout(() => setAnimationDone(true), 400);
    });
  }, []);

  useEffect(() => {
    setPanelHeight(null);
    setCurrentPage(0);
  }, [route?.id]);

  const goToPage = useCallback((page) => {
    const clamped = Math.max(0, Math.min(2, page));
    // Switching pages should always return to the page's default panel height.
    setPanelHeight(null);
    setCurrentPage(clamped);
  }, []);

  const handleSwipeStart = useCallback((e) => {
    const t = e.touches?.[0];
    if (!t) return;
    swipeStartXRef.current = t.clientX;
    swipeStartYRef.current = t.clientY;
  }, []);

  const handleSwipeEnd = useCallback((e) => {
    const t = e.changedTouches?.[0];
    if (!t || swipeStartXRef.current == null || swipeStartYRef.current == null) return;

    const dx = t.clientX - swipeStartXRef.current;
    const dy = t.clientY - swipeStartYRef.current;

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    // Only horizontal swipe should trigger page change.
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const handleMouseSwipeStart = useCallback((e) => {
    // Ignore interactions that start on actionable controls.
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea, summary')) return;
    mouseSwipeStartXRef.current = e.clientX;
    mouseSwipeStartYRef.current = e.clientY;
  }, []);

  const handleMouseSwipeEnd = useCallback((e) => {
    if (mouseSwipeStartXRef.current == null || mouseSwipeStartYRef.current == null) return;

    const dx = e.clientX - mouseSwipeStartXRef.current;
    const dy = e.clientY - mouseSwipeStartYRef.current;

    mouseSwipeStartXRef.current = null;
    mouseSwipeStartYRef.current = null;

    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const clearMouseSwipe = useCallback(() => {
    mouseSwipeStartXRef.current = null;
    mouseSwipeStartYRef.current = null;
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.cancelable) e.preventDefault();
    isDraggingRef.current = true;
    dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    dragStartHeight.current = panelRef.current?.offsetHeight ?? (window.innerHeight * defaultHeightVh / 100);

    // Style handle imperatively
    if (handleBarRef.current) {
      handleBarRef.current.style.width = '56px';
      handleBarRef.current.style.background = 'var(--accent-primary)';
    }
    // Disable CSS transition during drag so it doesn't fight direct DOM changes
    if (panelRef.current) panelRef.current.style.transition = 'none';
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev) => {
      if (!isDraggingRef.current || !panelRef.current) return;
      const clientY = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
      const delta = dragStartY.current - clientY;
      const maxH = window.innerHeight * MAX_HEIGHT_VH / 100;
      const newH = Math.min(maxH, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
      // Direct DOM mutation â€” zero React re-renders during drag
      panelRef.current.style.height = `${newH}px`;
    };

    const handleUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      // Commit final height to React state (1 re-render total)
      const finalH = panelRef.current ? parseFloat(panelRef.current.style.height) || null : null;
      setPanelHeight(finalH);
      // Re-enable CSS transition after committing
      if (panelRef.current) panelRef.current.style.transition = '';
      if (handleBarRef.current) {
        handleBarRef.current.style.width = '';
        handleBarRef.current.style.background = '';
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);
  }, [defaultHeightVh]);

  const handleShare = useCallback(async () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?route=${encodeURIComponent(route?.fileName || '')}`;
    const shareData = {
      title: route?.name || 'Hiking Route',
      text: `Check out this hike: ${route?.name} â€” ${route?.stats?.distance}km, +${route?.stats?.elevationGain}m gain`,
      url: shareUrl,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2200);
      }
    } catch (err) {
      // User cancelled share dialog, or clipboard failed â€” try fallback
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareToast(true);
          setTimeout(() => setShareToast(false), 2200);
        } catch {
          // Last resort: prompt
          window.prompt('Copy this link to share:', shareUrl);
        }
      }
    }
  }, [route]);

  const handleExport = useCallback((event) => {
    if (!route?.isContributed) return;
    event.preventDefault();
    const blob = new Blob([routeToGPX(route)], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${route.name || 'hiking-route'}.gpx`.replace(/[\\/:*?"<>|]+/g, '-');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [route]);

  const shouldAutoSizePages = window.innerWidth >= 600;
  const usesNaturalHeight = shouldAutoSizePages && currentPage !== 1 && panelHeight == null;
  const resolvedPanelHeight = panelHeight ?? (window.innerHeight * defaultHeightVh / 100);

  // Report the actual rendered panel height to the parent.
  useEffect(() => {
    onHeightChange?.(panelRef.current?.offsetHeight ?? resolvedPanelHeight);
  }, [onHeightChange, resolvedPanelHeight, usesNaturalHeight, currentPage, route?.id, showChartDeferred]);

  if (!route) return null;
  const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
  const segmentCount = route.lineSegments?.length || 0;
  const aboutParagraphs = buildAboutParagraphs(route.description);
  const highlightChips = getHighlights(route);
  const shouldAnimateHeight = isMobile || currentPage === 1 || panelHeight != null;

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000, pointerEvents: 'none' }}>
      <div
        ref={panelRef}
        style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          height: usesNaturalHeight ? 'auto' : `${resolvedPanelHeight}px`,
          maxHeight: usesNaturalHeight ? `${window.innerHeight * MAX_HEIGHT_VH / 100}px` : 'none',
          width: isMobile ? '100%' : 'min(100%, 540px)',
          margin: '0 auto',
          overflow: 'hidden',
          transform: animationDone ? 'none' : (isMounted ? 'translateY(0)' : 'translateY(100%)'),
          transition: animationDone
            ? (shouldAnimateHeight ? 'height 0.25s ease' : 'none')
            : (shouldAnimateHeight
              ? 'height 0.25s ease, transform 0.35s cubic-bezier(0.4,0,0.2,1)'
              : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'),
          pointerEvents: 'auto',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Drag Handle */}
        <div style={{ flexShrink: 0 }}>
          {/* Drag Handle */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onMouseEnter={() => setIsHandleHovered(true)}
            onMouseLeave={() => setIsHandleHovered(false)}
            style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              padding: '10px 0 6px',
              cursor: 'ns-resize',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              flexShrink: 0,
            }}
            title="Drag to resize"
          >
            <div
              ref={handleBarRef}
              style={{
                width: isHandleHovered ? 48 : 36,
                height: 4,
                background: isHandleHovered ? 'var(--text-secondary)' : 'var(--border)',
                borderRadius: 2,
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          </div>

          {/* Header â€” always visible */}
          <div
            style={{
              position: 'relative',
              margin: '4px 12px 0',
              borderRadius: 12,
              overflow: 'hidden',
              background: heroImage ? `url(${heroImage}) center / cover no-repeat` : 'var(--bg-card)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.22) 52%, rgba(0,0,0,0.58) 100%)',
              }}
            />
            <div style={{ position: 'relative', padding: '8px 12px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="section-label" style={{ marginBottom: 2, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Active Route</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{
                    fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#f8fafc',
                    fontFamily: 'Playfair Display, serif', lineHeight: 1.2, marginBottom: 6,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    textShadow: '0 2px 8px rgba(0,0,0,0.65)',
                  }}>
                    {route.name}
                  </h2>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: DIFF_COLORS[route.difficulty],
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.24)',
                  }}>
                    {route.difficulty}
                  </span>

                  {route?.contributorName && (
                    <div style={{
                      display: 'inline-flex', flexDirection: 'column', gap: 2,
                      marginTop: 8,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: 'rgba(255,255,255,0.8)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                      }}>
                        Contributed by
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: '#f8fafc',
                        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      }}>
                        {route.contributorName}
                        {route.contributorEmail && (
                          <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                            {' · '}{maskEmail(route.contributorEmail)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  <a
                    href={route.isContributed ? 'data:text/plain,' : resolveAssetUrl(`/kml/${encodeURIComponent(route.fileName)}`)}
                    download
                    onClick={handleExport}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: isMobile ? 10 : 11, fontWeight: 600, color: '#ffffff',
                      padding: '6px 10px', borderRadius: 10,
                      background: '#0ea5e9', border: '1px solid #0284c7',
                      textDecoration: 'none', transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#0284c7'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#0ea5e9'; }}
                    title={`Export GPS (${route.fileName})`}
                  >
                    <Download size={12} /> Export GPS
                  </a>
                  <button
                    onClick={handleShare}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: isMobile ? 10 : 11, fontWeight: 600,
                      color: '#ffffff',
                      padding: '6px 10px', borderRadius: 10,
                      background: shareToast ? '#16a34a' : '#7c3aed',
                      border: `1px solid ${shareToast ? '#15803d' : '#6d28d9'}`,
                      cursor: 'pointer', transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => { if (!shareToast) e.currentTarget.style.background = '#6d28d9'; }}
                    onMouseLeave={e => { if (!shareToast) e.currentTarget.style.background = '#7c3aed'; }}
                    title="Share this route"
                  >
                    {shareToast ? <Check size={12} /> : <Share2 size={12} />}
                    {shareToast ? 'Copied!' : 'Share'}
                  </button>
                </div>
              </div>
              
              {(route.district || route.highlights) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, marginBottom: 8 }}>
                  {route.district && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                      <MapPin size={11} />
                      <span className="truncate">{route.district}{route.province ? `, ${route.province}` : ''}</span>
                    </div>
                  )}
                  {route.highlights && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                      <Star size={11} />
                      <span className="truncate">{route.highlights}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
                {segmentCount > 1 && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: '1px solid #1d4ed8',
                  }}>
                    {segmentCount} segments
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(15,17,23,0.68)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8,
                padding: '6px', cursor: 'pointer', color: '#f0f0f5', marginLeft: 12, flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
          </div>

          {/* Clickable page titles */}
          <div style={{ padding: '6px 20px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {['Summary', 'Profile', 'More'].map((label, idx) => (
              <button
                key={label}
                onClick={() => goToPage(idx)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: currentPage === idx ? 'var(--accent-primary)' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: currentPage === idx ? 700 : 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '2px 0',
                  borderBottom: currentPage === idx ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
                aria-label={`Go to ${label} page`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{ flex: usesNaturalHeight ? '0 0 auto' : 1, minHeight: 0, overflow: 'hidden', padding: currentPage === 0 ? '0 0 6px' : '0 0 12px' }}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
          onMouseDown={handleMouseSwipeStart}
          onMouseUp={handleMouseSwipeEnd}
          onMouseLeave={clearMouseSwipe}
        >
          <div
            style={{
              display: 'flex',
              width: usesNaturalHeight ? '100%' : '300%',
              height: usesNaturalHeight ? 'auto' : '100%',
              transform: usesNaturalHeight ? 'none' : `translateX(-${currentPage * 33.3333}%)`,
              transition: usesNaturalHeight ? 'none' : 'transform 0.28s ease',
            }}
          >
            {/* Page 1: Summary */}
            <div style={{ width: usesNaturalHeight ? '100%' : '33.3333%', minWidth: 0, padding: '6px 20px 0', display: usesNaturalHeight && currentPage !== 0 ? 'none' : 'block' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                <BigStat
                  icon={<Mountain size={14} />}
                  value={`${route.stats.distance}km`}
                  label="Distance"
                  color={color}
                  compact={isMobile}
                  showRightDivider
                />
                <BigStat
                  icon={<TrendingUp size={14} />}
                  value={`+${route.stats.elevationGain}m`}
                  label="Gain"
                  color={color}
                  compact={isMobile}
                  showBottomDivider={isMobile}
                />
                <BigStat
                  icon={<TrendingDown size={14} />}
                  value={`-${route.stats.elevationLoss}m`}
                  label="Loss"
                  color="var(--accent-blue)"
                  compact={isMobile}
                  showRightDivider={isMobile}
                />
                <BigStat
                  icon={<Clock size={14} />}
                  value={formatEstimatedTime(route.stats.estimatedHours)}
                  label="Time"
                  color="var(--accent-green)"
                  compact={isMobile}
                />
              </div>
            </div>

            {/* Page 2: Elevation profile */}
            <div style={{ width: usesNaturalHeight ? '100%' : '33.3333%', minWidth: 0, padding: '8px 20px 0', display: usesNaturalHeight ? 'none' : 'flex', flexDirection: 'column' }}>
              <div className="section-label" style={{ marginBottom: 6, flexShrink: 0 }}>Elevation Profile</div>
              <div style={{ flex: 1, minHeight: 80, opacity: showChartDeferred ? 1 : 0, transition: 'opacity 0.3s ease', position: 'relative' }}>
                {route.loadError ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', textAlign: 'center', padding: '0 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Failed to load route details</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{route.loadError}</span>
                  </div>
                ) : !route.isLazyLoaded ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ width:24, height:24, border:`2px solid var(--accent-primary)`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom: 8 }} />
                    <span style={{ fontSize: 11 }}>Loading route details...</span>
                  </div>
                ) : (
                  currentPage === 1 && showChartDeferred && <ElevationChart route={route} color={color} />
                )}
              </div>
              {route.stats?.maxElevation != null && (
                <div style={{ marginTop: 4, fontSize: 10, color: color, fontWeight: 600 }}>
                  Peak: {route.stats.maxElevation}m
                </div>
              )}
            </div>

            {/* Page 3: Extra information */}
            <div style={{ width: usesNaturalHeight ? '100%' : '33.3333%', minWidth: 0, padding: '8px 20px 0', display: usesNaturalHeight && currentPage !== 2 ? 'none' : 'block' }}>
              <StartEndBar
                startValue={route.stats.startElevation != null ? `${route.stats.startElevation}m` : '-'}
                endValue={route.stats.endElevation != null ? `${route.stats.endElevation}m` : '-'}
              />

              {route.isLazyLoaded && route.waypoints && route.waypoints.length >= 2 && (() => {
                const start = route.waypoints.find(w => w.type === 'start') || route.waypoints[0];
                const end = route.waypoints.find(w => w.type === 'end') || route.waypoints[route.waypoints.length - 1];
                const gmapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
                return (
                  <div style={{ paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <a
                      href={gmapsUrl(start.lat, start.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 8,
                        background: '#16a34a', border: '1px solid #15803d',
                        textDecoration: 'none', transition: 'background 0.2s',
                        fontSize: 11, color: '#ffffff', fontWeight: 600,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#15803d'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
                      title={`Open start point in Google Maps (${start.lat.toFixed(4)}, ${start.lng.toFixed(4)})`}
                    >
                      <MapPin size={13} /> Start Point
                    </a>
                    <a
                      href={gmapsUrl(end.lat, end.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 8,
                        background: '#dc2626', border: '1px solid #b91c1c',
                        textDecoration: 'none', transition: 'background 0.2s',
                        fontSize: 11, color: '#ffffff', fontWeight: 600,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#b91c1c'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#dc2626'; }}
                      title={`Open end point in Google Maps (${end.lat.toFixed(4)}, ${end.lng.toFixed(4)})`}
                    >
                      <Flag size={13} /> End Point
                    </a>
                  </div>
                );
              })()}

              {route.description && (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
                  <div className="section-label" style={{ marginBottom: 4 }}>About</div>
                  {highlightChips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {highlightChips.map(chip => (
                        <span
                          key={chip}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            borderRadius: 999,
                            padding: '3px 8px',
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {(aboutParagraphs.length ? aboutParagraphs : [route.description]).map((paragraph, i) => (
                    <p
                      key={`about-${i}`}
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.55,
                        margin: i === 0 ? '0 0 6px' : '0',
                      }}
                    >
                      {paragraph}
                    </p>
                  ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ icon, value, label, color, compact = false, showRightDivider = false, showBottomDivider = false }) {
  return (
    <div style={{
      padding: compact ? '7px 8px' : '10px 12px',
      minHeight: compact ? 52 : 68,
      borderRight: showRightDivider ? '1px solid var(--border)' : 'none',
      borderBottom: showBottomDivider ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', minWidth: 0 }}>
        <span style={{ display: 'flex', flexShrink: 0, opacity: 0.9 }}>{icon}</span>
        <span style={{ fontSize: compact ? 10 : 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ marginTop: compact ? 2 : 4, fontSize: compact ? 15 : 20, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}

function StartEndBar({ startValue, endValue, route }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 10,
      padding: '8px',
      border: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
    }}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
        <div className="section-label" style={{ marginBottom: 2 }}>Start</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{startValue}</div>
      </div>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
        <div className="section-label" style={{ marginBottom: 2, textAlign: 'right' }}>End</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{endValue}</div>
      </div>

      {route?.contributorName && (
        <div style={{ gridColumn: '1 / -1', marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contributed by</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-primary)' }}>{route.contributorName}</div>
          {route.contributorEmail && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{maskEmail(route.contributorEmail)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function maskEmail(email) {
  if (!email) return '';
  const [localPart, domainPart] = String(email).split('@');
  if (!domainPart) return email;

  const visibleChars = localPart.length > 2 ? localPart.slice(0, 2) : localPart.slice(0, localPart.length);
  const maskedChars = '*'.repeat(Math.max(4, localPart.length - visibleChars.length));
  return `${visibleChars}${maskedChars}@${domainPart}`;
}
