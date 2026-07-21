'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { ProgressCard } from '@/components/progress/ProgressCard'
import { LogTerminal } from '@/components/progress/LogTerminal'
import { useJobSocket } from '@/lib/useJobSocket'
import { useAnalysisStore } from '@/store/useAnalysisStore'

const STEPS = [
  { label: 'Loading TIFF Files',       sub: 'Reading pre/post images into memory'              },
  { label: 'Projection Matching',      sub: 'CRS reprojection, pixel alignment'                },
  { label: 'Building Segmentation',    sub: 'Detecting building footprints with SegFormer'     },
  { label: 'Change Analysis',          sub: 'Computing polygon extraction'                     },
  { label: 'Damage Classification',    sub: 'Running 4-class damage model'                     },
  { label: 'GeoJSON Export',           sub: 'Polygon database and statistics report'           },
]

// Pipeline stdout markers → step index
const LOG_STEP_MARKERS: Array<{ pattern: RegExp; step: number }> = [
  { pattern: /\[1\/3\]/,  step: 2 },
  { pattern: /\[2\/3\]/,  step: 3 },
  { pattern: /\[3\/3\]/,  step: 4 },
  { pattern: /Sonuç:|GeoJSON|buildings\.geojson/i, step: 5 },
]

export default function ProgressPage() {
  const router = useRouter()
  const params = useParams<{ jobId: string }>()
  const { projectName, projectId, setAnalysisId } = useAnalysisStore()

  const [activeStep, setActiveStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const completedAnalysisId = useRef<string | null>(null)

  // Timer-based progress animation capped at 85% — actual completion pushes to 100%.
  useEffect(() => {
    const STEPS_DURATIONS = [1200, 900, 0, 0, 0, 0] // only animate first two steps
    const ANIM_TOTAL = STEPS_DURATIONS.reduce((a, b) => a + b, 0)
    let elapsed = 0
    let stepIdx = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    const runStep = (i: number) => {
      if (i >= 2) return // hand off to log-driven advancement after step 1
      setActiveStep(i)
      const dur = STEPS_DURATIONS[i]
      const start = Date.now()
      const tick = () => {
        const frac = Math.min((Date.now() - start) / dur, 1)
        setProgress(Math.round(((elapsed + frac * dur) / ANIM_TOTAL) * 25)) // max 25% from timer
        if (frac < 1) requestAnimationFrame(tick)
        else {
          elapsed += dur
          stepIdx++
          timers.push(setTimeout(() => runStep(stepIdx), 50))
        }
      }
      requestAnimationFrame(tick)
    }

    timers.push(setTimeout(() => runStep(0), 400))
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, line])

    // Advance step based on log content
    for (const { pattern, step } of LOG_STEP_MARKERS) {
      if (pattern.test(line)) {
        setActiveStep((prev) => Math.max(prev, step))
        // Map step index to progress: step 2→35%, 3→55%, 4→75%, 5→90%
        const progressMap: Record<number, number> = { 2: 35, 3: 55, 4: 75, 5: 90 }
        if (progressMap[step] !== undefined) {
          setProgress((prev) => Math.max(prev, progressMap[step]))
        }
        break
      }
    }
  }, [])

  const handleCompleted = useCallback((analysisId: string) => {
    completedAnalysisId.current = analysisId
    setAnalysisId(analysisId)
    setProgress(100)
    setActiveStep(STEPS.length)
    setTimeout(() => setDone(true), 300)
  }, [setAnalysisId])

  useJobSocket({
    jobId: params.jobId,
    onCompleted: handleCompleted,
    onFailed: (err) => setFailed(err),
    onLog: handleLog,
  })

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header
        center={<span className="text-[13px] text-[#6b6864] font-mono">{projectName}</span>}
        right={
          projectId ? (
            <Link
              href={`/projects/${projectId}`}
              className="text-[12px] font-medium text-accent hover:underline"
            >
              Project analyses
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[700px] animate-fade-up">
          {failed ? (
            <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
              <div className="text-[15px] font-semibold text-red-700 mb-2">Pipeline Failed</div>
              <div className="text-[13px] text-red-500 mb-6">{failed}</div>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 rounded-xl bg-accent text-white text-[14px] font-semibold"
              >
                ← Go Back
              </button>
            </div>
          ) : (
            <>
              <ProgressCard steps={STEPS} activeIndex={activeStep} progress={progress} done={done} />
              <LogTerminal lines={logLines} done={done} />
              {done && (
                <div className="mt-4 animate-fade-up">
                  <button
                    onClick={() => router.push(`/map/${completedAnalysisId.current}`)}
                    className="w-full py-3.5 rounded-xl bg-accent text-white text-[15px] font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.27)] hover:-translate-y-px transition-all"
                  >
                    Go to Map &amp; Dashboard  →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
