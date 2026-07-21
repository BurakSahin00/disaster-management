import { useEffect, useRef } from 'react'

interface LogTerminalProps {
  lines: string[]
  done: boolean
}

export function LogTerminal({ lines, done }: LogTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  return (
    <div className="bg-[#1e1c1a] rounded-xl overflow-hidden border border-[#3a3836]">
      <div className="px-4 py-2 border-b border-[#3a3836] flex gap-1.5 items-center">
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
        ))}
        <span className="ml-2 text-[11px] text-[#6b6864] font-mono">analysis.log</span>
      </div>
      <div className="px-4 py-3 h-[138px] overflow-y-auto flex flex-col gap-0.5">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`font-mono text-[11px] leading-relaxed animate-step-in
              ${l.includes('[DEBUG]') ? 'text-[#6b6864]' : l.includes('✓') ? 'text-[#22c55e]' : 'text-[#a8a49f]'}
            `}
          >
            {l}
          </div>
        ))}
        {!done && <span className="font-mono text-[11px] text-[#6b6864] animate-blink">█</span>}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
