interface TagProps {
  label: string
  color: string
}

export function Tag({ label, color }: TagProps) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
