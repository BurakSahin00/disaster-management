import { DAMAGE_CLASSES } from '@/types'
import { Tag } from '@/components/shared/Tag'
import type { GeoJsonBuilding } from '@/types'

interface BuildingPopupProps {
  building: GeoJsonBuilding
  onClose: () => void
}

export function BuildingPopup({ building, onClose }: BuildingPopupProps) {
  const p = building.properties
  const dmg = DAMAGE_CLASSES[p.damage_class ?? 0] ?? DAMAGE_CLASSES[0]

  const rows: [string, string][] = [
    ...(p.area_m2 != null ? [['Alan', `~${p.area_m2} m²`] as [string, string]] : []),
    ...(p.confidence != null ? [['Model Güven', `%${p.confidence}`] as [string, string]] : []),
  ]

  return (
    <div className="absolute top-3 left-4 z-[1000] w-[230px] bg-white rounded-xl border border-border shadow-lg animate-fade-up overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#f0ede8] flex justify-between items-center">
        <span className="text-[12px] font-semibold">Bina #{p.id}</span>
        <button onClick={onClose} className="text-text-faint text-lg leading-none hover:text-text-primary">×</button>
      </div>
      <div className="px-3.5 py-2.5">
        <div className="mb-2">
          <Tag color={dmg.color} light={dmg.light} border={dmg.border} label={dmg.label} />
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1 border-b border-[#f4f2ef]">
            <span className="text-[11px] text-text-muted">{k}</span>
            <span className="text-[11px] font-mono text-text-primary">{v}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-[11px] text-text-faint">Ek özellik yok</div>
        )}
      </div>
    </div>
  )
}
