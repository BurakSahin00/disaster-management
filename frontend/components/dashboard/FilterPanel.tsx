import { DAMAGE_CLASSES } from '@/types'

interface FilterPanelProps {
  filters: Record<number, boolean>
  counts: Record<number, number>
  total: number
  onToggle: (id: number) => void
  onShowAll: () => void
  onShowCritical: () => void
}

export function FilterPanel({ filters, counts, total, onToggle, onShowAll, onShowCritical }: FilterPanelProps) {
  return (
    <div>
      <p className="text-[11px] text-[#6b6864] mb-3.5 leading-relaxed">
        Select the damage classes you want to see on the map.
      </p>
      {DAMAGE_CLASSES.map((d) => (
        <div
          key={d.id}
          role="button"
          tabIndex={0}
          onClick={() => onToggle(d.id)}
          onKeyDown={(e) => e.key === 'Enter' && onToggle(d.id)}
          className="flex items-center gap-2.5 p-3 rounded-lg border mb-2 cursor-pointer transition-all"
          style={{
            border: `1px solid ${filters[d.id] ? d.border : '#ebe9e4'}`,
            background: filters[d.id] ? d.light : 'white',
          }}
        >
          <div
            className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-all"
            style={{
              border: `1.5px solid ${filters[d.id] ? d.color : '#d1cfc8'}`,
              background: filters[d.id] ? d.color : 'white',
            }}
          >
            {filters[d.id] && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="2 5 4.5 7.5 8.5 2.5" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <div className="text-[12px] font-medium" style={{ color: filters[d.id] ? d.color : '#444' }}>{d.label}</div>
            <div className="text-[10px] text-text-faint">{counts[d.id] ?? 0} buildings · {total > 0 ? Math.round((counts[d.id] ?? 0) / total * 100) : 0}%</div>
          </div>
          <div className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: d.color }} />
        </div>
      ))}
      <button onClick={onShowAll} className="w-full mt-1 py-2.5 rounded-lg border border-[#d1cfc8] bg-white text-[12px] text-[#444] hover:bg-[#faf9f7] transition-colors">
        Show All
      </button>
      <button onClick={onShowCritical} className="w-full mt-1.5 py-2.5 rounded-lg border border-accent bg-accent-light text-[12px] text-accent font-medium hover:bg-blue-100 transition-colors">
        Critical Damage Only
      </button>
    </div>
  )
}
