'use client'

import { useEffect, useState } from 'react'
import { useJobSocket } from '@/lib/ws'

const STEPS = [
  'Görüntüler yükleniyor',
  'Bina segmentasyonu',
  'Poligon çıkarımı',
  'Hasar sınıflandırma',
]

interface ProgressScreenProps {
  jobId: string
  onCompleted: (analysisId: string) => void
  onFailed: (error: string) => void
}

export function ProgressScreen({ jobId, onCompleted, onFailed }: ProgressScreenProps) {
  const [status, setStatus] = useState<string>('pending')
  const [stepIndex, setStepIndex] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useJobSocket(jobId, {
    onStatus: (s) => {
      setStatus(s)
      if (s === 'running') {
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString('tr-TR')}] Pipeline başladı`,
        ])
      }
    },
    onCompleted: (analysisId) => {
      setStepIndex(STEPS.length)
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString('tr-TR')}] Analiz tamamlandı ✓`,
      ])
      onCompleted(analysisId)
    },
    onFailed: (err) => {
      setError(err)
      onFailed(err)
    },
  })

  useEffect(() => {
    if (status !== 'running') return
    const delays = [1500, 4000, 7000]
    const timers = delays.map((delay, i) =>
      window.setTimeout(() => setStepIndex(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [status])

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-8">
      <div className="w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-100 mb-6">Analiz işleniyor...</h2>

        <div className="space-y-4">
          {STEPS.map((step, i) => {
            const isCompleted = i < stepIndex
            const isActive = i === stepIndex && status === 'running'

            return (
              <div key={step} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isCompleted
                      ? 'bg-green-500'
                      : isActive
                        ? 'bg-blue-600'
                        : 'bg-slate-700'
                  }`}
                >
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isActive ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : null}
                </div>
                <span
                  className={`text-sm transition-colors ${
                    isCompleted ? 'text-green-400' : isActive ? 'text-slate-100' : 'text-slate-500'
                  }`}
                >
                  {step}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {logs.length > 0 && (
        <div className="w-full max-w-md bg-slate-800 rounded-lg p-4 font-mono text-xs text-slate-400 space-y-1 max-h-32 overflow-y-auto">
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="w-full max-w-md bg-red-900/20 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium mb-1">Hata</p>
          <p className="text-red-300 text-sm font-mono">{error}</p>
        </div>
      )}
    </div>
  )
}
