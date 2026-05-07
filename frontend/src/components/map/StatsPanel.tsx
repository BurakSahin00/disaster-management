import { StatCard } from '@/components/ui/StatCard'
import { DAMAGE_CLASSES } from '@/lib/damage'
import type { GeoJSONFeatureCollection } from '@/types'

interface StatsPanelProps {
  buildings: GeoJSONFeatureCollection | null
  showBuildings: boolean
  showRegions: boolean
  showClusters: boolean
  onToggleBuildings: () => void
  onToggleRegions: () => void
  onToggleClusters: () => void
}

export function StatsPanel({
  buildings,
  showBuildings,
  showRegions,
  showClusters,
  onToggleBuildings,
  onToggleRegions,
  onToggleClusters,
}: StatsPanelProps) {
  const features = buildings?.features ?? []
  const total = features.length

  const classCounts = ([0, 1, 2, 3] as const).map((cls) => ({
    ...DAMAGE_CLASSES[cls],
    count: features.filter((f) => f.properties?.damage_class === cls).length,
  }))

  const layers = [
    { label: 'Binalar',  active: showBuildings, toggle: onToggleBuildings },
    { label: 'Bölgeler', active: showRegions,   toggle: onToggleRegions },
    { label: 'Kümeler',  active: showClusters,  toggle: onToggleClusters },
  ]

  return (
    <aside className="w-72 flex-shrink-0 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-slate-800">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Toplam Bina</div>
        <div className="text-3xl font-bold text-slate-100 tabular-nums">
          {total}
        </div>
      </div>

      <div className="p-4 space-y-2 border-b border-slate-800">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Hasar Dağılımı</div>
        {classCounts.map((cls) => (
          <StatCard
            key={cls.key}
            label={cls.label}
            value={cls.count}
            percentage={total > 0 ? (cls.count / total) * 100 : 0}
            color={cls.color}
          />
        ))}
      </div>

      <div className="p-4 space-y-2">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Katmanlar</div>
        {layers.map(({ label, active, toggle }) => (
          <button
            key={label}
            onClick={toggle}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
            }`}
          >
            {label}
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                active ? 'bg-blue-600 border-blue-600' : 'border-slate-600'
              }`}
            >
              {active && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}
