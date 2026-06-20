interface TagProps {
  color: string
  light: string
  border: string
  label: string
}

export function Tag({ color, light, border, label }: TagProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: light, color, border: `1px solid ${border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}
