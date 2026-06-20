import { DAMAGE_CLASSES } from '@/types'

interface MapLegendProps {
  counts: Record<number, number>
  filters: Record<number, boolean>
  onToggle: (id: number) => void
}

export function MapLegend({ counts, filters, onToggle }: MapLegendProps) {
  return (
    <div className="absolute bottom-5 left-4 z-[1000] bg-white rounded-xl border border-border p-2.5 shadow-md">
      <div className="text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
        Hasar Sınıfı
      </div>
      {DAMAGE_CLASSES.map((d) => (
        <div
          key={d.id}
          onClick={() => onToggle(d.id)}
          className="flex items-center gap-1.5 py-0.5 cursor-pointer transition-opacity"
          style={{ opacity: filters[d.id] ? 1 : 0.35 }}
        >
          <div className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: d.color }} />
          <span className="text-[11px] text-[#444] font-medium">{d.label}</span>
          <span className="text-[10px] text-text-faint font-mono ml-auto pl-2">{counts[d.id] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}
