import { memo } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';

const ROUTE_COLORS = [
  '#f97316', '#60a5fa', '#34d399', '#f59e0b', '#a78bfa',
  '#fb7185', '#22d3ee', '#84cc16', '#e879f9', '#38bdf8',
];

const RouteCard = memo(function RouteCard({ route, index, isActive, onClick, onDelete }) {
  const color = ROUTE_COLORS[index % ROUTE_COLORS.length];

  const handleClick = () => onClick(route);
  const handleDelete = (e) => { e.stopPropagation(); onDelete(route.id); };

  return (
    <div
      className={`route-card rounded-xl p-4 cursor-pointer relative group ${isActive ? 'active' : ''}`}
      onClick={handleClick}
      style={{ '--card-delay': `${Math.min(index * 0.04, 0.3)}s`, animationDelay: `${Math.min(index * 0.04, 0.3)}s` }}
    >
      {/* Accent color bar */}
      <div style={{
        position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
        background: color, borderRadius: '0 2px 2px 0',
        opacity: isActive ? 1 : 0.5,
        transition: 'opacity 0.2s',
      }} />

      <div style={{ paddingLeft: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Title with colored stats */}
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            <span>{route.name} : </span>
            <span style={{ color: '#f97316' }}>{route.stats.distance}km</span>
            <span>, </span>
            <span style={{ color: '#ef4444' }}>+{route.stats.elevationGain}m</span>
            <span>, </span>
            <span style={{ color: '#10b981' }}>-{route.stats.elevationLoss}m</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <button
              onClick={handleDelete}
              style={{
                opacity: 0,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: '#ef4444',
                transition: 'opacity 0.2s', display: 'flex', alignItems: 'center',
              }}
              title="Delete Route"
              className="group-hover:opacity-100"
              aria-label="Delete route"
            >
              <Trash2 size={12} />
            </button>
            <ChevronRight size={14} style={{ color: isActive ? color : 'var(--text-muted)', transition: 'color 0.2s', flexShrink: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default RouteCard;