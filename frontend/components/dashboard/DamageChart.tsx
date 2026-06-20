import { DAMAGE_CLASSES } from '@/types'

interface DamageChartProps {
  counts: Record<number, number>
  total: number
}

export function DamageChart({ counts, total }: DamageChartProps) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6b6864] mb-2.5 uppercase tracking-[0.4px]">
        Hasar Dağılımı
      </div>
      {DAMAGE_CLASSES.map((d) => {
        const pct = total > 0 ? Math.round((counts[d.id] ?? 0) / total * 100) : 0
        return (
          <div key={d.id} className="mb-2">
            <div className="flex justify-between mb-0.5">
              <span className="text-[11px] text-[#444] font-medium">{d.label}</span>
              <span className="text-[11px] font-mono text-[#6b6864]">{counts[d.id] ?? 0} · %{pct}</span>
            </div>
            <div className="h-[5px] bg-[#f0ede8] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-[cubic-bezier(.4,0,.2,1)]"
                style={{ width: `${pct}%`, background: d.color }}
              />
            </div>
          </div>
        )
      })}
      <div className="mt-4 mb-1">
        <div className="text-[11px] font-semibold text-[#6b6864] mb-2 uppercase tracking-[0.4px]">
          Oransal Görünüm
        </div>
        <div className="h-5 rounded-md overflow-hidden flex gap-px">
          {DAMAGE_CLASSES.map((d) => {
            const pct = total > 0 ? (counts[d.id] ?? 0) / total * 100 : 0
            return pct > 0 ? (
              <div
                key={d.id}
                title={`${d.label}: %${Math.round(pct)}`}
                style={{ width: `${pct}%`, background: d.color }}
              />
            ) : null
          })}
        </div>
      </div>
    </div>
  )
}
