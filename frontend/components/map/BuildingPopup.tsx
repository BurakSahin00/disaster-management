import { DAMAGE_CLASSES } from '@/types'
import { Tag } from '@/components/shared/Tag'
import type { GeoJsonBuilding } from '@/types'

interface BuildingPopupProps {
  building: GeoJsonBuilding
  onClose: () => void
}

function confidenceColor(pct: number): string {
  if (pct >= 80) return '#16a34a'
  if (pct >= 60) return '#65a30d'
  if (pct >= 40) return '#ea580c'
  return '#dc2626'
}

export function BuildingPopup({ building, onClose }: BuildingPopupProps) {
  const p = building.properties
  const dmg = DAMAGE_CLASSES[p.damage_class ?? 0] ?? DAMAGE_CLASSES[0]

  const confPct = p.confidence != null ? Math.round(p.confidence * 100) : null

  const rows: [string, string][] = [
    ...(p.area_m2 != null ? [['Area', `~${p.area_m2} m²`] as [string, string]] : []),
  ]

  return (
    <div className="absolute top-3 left-4 z-[1000] w-[230px] bg-white rounded-xl border border-border shadow-lg animate-fade-up overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#f0ede8] flex justify-between items-center">
        <span className="text-[12px] font-semibold">Building #{p.id}</span>
        <button onClick={onClose} className="text-text-faint text-lg leading-none hover:text-text-primary">×</button>
      </div>
      <div className="px-3.5 py-2.5">
        <div className="mb-2">
          <Tag color={dmg.color} light={dmg.light} border={dmg.border} label={dmg.label} />
        </div>

        {confPct != null && (
          <div className="mb-2.5 pb-2.5 border-b border-[#f4f2ef]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-muted">Model Confidence</span>
              <span
                className="text-[12px] font-semibold font-mono"
                style={{ color: confidenceColor(confPct) }}
              >
                {confPct}%
              </span>
            </div>
            <div className="h-[5px] rounded-full bg-[#f0ede8] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${confPct}%`,
                  background: confidenceColor(confPct),
                }}
              />
            </div>
          </div>
        )}

        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1 border-b border-[#f4f2ef]">
            <span className="text-[11px] text-text-muted">{k}</span>
            <span className="text-[11px] font-mono text-text-primary">{v}</span>
          </div>
        ))}
        {rows.length === 0 && confPct == null && (
          <div className="text-[11px] text-text-faint">No additional properties</div>
        )}
      </div>
    </div>
  )
}
