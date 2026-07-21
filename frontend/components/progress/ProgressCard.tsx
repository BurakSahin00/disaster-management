import { StepList, type Step } from './StepList'

interface ProgressCardProps {
  steps: Step[]
  activeIndex: number
  progress: number
  done: boolean
}

export function ProgressCard({ steps, activeIndex, progress, done }: ProgressCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden mb-4">
      <div className="px-7 py-6 border-b border-border">
        <div className="flex justify-between items-center mb-3">
          <div className="font-semibold text-[15px]">
            {done ? '✓  Analysis Complete' : 'Analysis in Progress…'}
          </div>
          <span className="font-mono text-[13px] text-accent font-medium">{progress}%</span>
        </div>
        <div className="h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: '#2563EB',
              backgroundImage: done
                ? 'none'
                : 'repeating-linear-gradient(90deg,transparent,transparent 8px,rgba(255,255,255,.25) 8px,rgba(255,255,255,.25) 16px)',
            }}
          />
        </div>
      </div>
      <StepList steps={steps} activeIndex={activeIndex} />
    </div>
  )
}
