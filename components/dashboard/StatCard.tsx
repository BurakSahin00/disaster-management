interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: string
}

export function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div className="flex-1 p-3.5 rounded-xl border border-border bg-white min-w-0">
      <div className="text-[11px] text-text-muted font-medium mb-1 uppercase tracking-[0.4px]">{label}</div>
      <div className="text-[22px] font-semibold tracking-tight" style={{ color: color ?? '#1A1917' }}>{value}</div>
      {sub && <div className="text-[11px] text-text-faint mt-0.5">{sub}</div>}
    </div>
  )
}
