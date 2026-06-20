export interface Step {
  label: string
  sub: string
}

interface StepListProps {
  steps: Step[]
  activeIndex: number
}

export function StepList({ steps, activeIndex }: StepListProps) {
  return (
    <div className="px-7 py-4">
      {steps.map((s, i) => {
        const status = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
        return (
          <div
            key={i}
            className={`flex items-center gap-3.5 py-2.5 transition-opacity duration-300
              ${i < steps.length - 1 ? 'border-b border-[#f4f2ef]' : ''}
              ${status === 'pending' ? 'opacity-40' : 'opacity-100'}
              ${status === 'active' ? 'animate-step-in' : ''}
            `}
          >
            <div
              className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center border-[1.5px] transition-all
                ${status === 'done' ? 'bg-[#dcfce7] border-[#16a34a]' : ''}
                ${status === 'active' ? 'bg-accent-light border-accent' : ''}
                ${status === 'pending' ? 'bg-[#f0ede8] border-[#d1cfc8]' : ''}
              `}
            >
              {status === 'done' && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>}
              {status === 'active' && <div className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />}
              {status === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-[#c0bdb7]" />}
            </div>
            <div className="flex-1">
              <div className={`text-[13px] ${status === 'active' ? 'font-semibold text-accent' : 'font-medium text-text-primary'}`}>
                {s.label}
              </div>
              <div className="text-[11px] text-text-faint mt-0.5">{s.sub}</div>
            </div>
            {status === 'done' && <span className="text-[11px] text-[#16a34a] font-mono">✓</span>}
            {status === 'active' && <span className="text-[10px] text-accent font-mono animate-pulse-dot">çalışıyor…</span>}
          </div>
        )
      })}
    </div>
  )
}
