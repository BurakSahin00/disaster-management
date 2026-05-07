export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L14 13H2L8 2Z" fill="white" />
        </svg>
      </div>
      <span className="font-semibold text-slate-100 text-sm tracking-wide">AFET ANALİZ</span>
    </div>
  )
}
