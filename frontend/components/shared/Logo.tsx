export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#2563EB" />
        <path d="M7 21 L14 8 L21 21" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
        <path d="M10.5 17 L17.5 17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="14" cy="8" r="2" fill="white" />
      </svg>
      <span className="font-semibold text-base tracking-tight text-text-primary">
        Disaster<span className="text-accent">Sense</span>
      </span>
    </div>
  )
}
