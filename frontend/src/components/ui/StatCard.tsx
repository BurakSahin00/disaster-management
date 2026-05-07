interface StatCardProps {
  label: string
  value: number
  percentage: number
  color: string
}

export function StatCard({ label, value, percentage, color }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 truncate">{label}</div>
        <div className="text-sm font-semibold text-slate-100 tabular-nums">
          {`${value} (${percentage.toFixed(1)}%)`}
        </div>
      </div>
    </div>
  )
}
