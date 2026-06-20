'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { ProgressCard } from '@/components/progress/ProgressCard'
import { LogTerminal } from '@/components/progress/LogTerminal'
import { useJobSocket } from '@/lib/useJobSocket'
import { useAnalysisStore } from '@/store/useAnalysisStore'

const STEPS = [
  { label: 'TIFF Dosyaları Yükleniyor',  sub: 'Pre/post görüntüler belleğe okunuyor',            duration: 1200 },
  { label: 'Projeksiyon Eşleştirme',      sub: 'CRS dönüşümü, piksel hizalama',                   duration: 900  },
  { label: 'Bina Segmentasyonu',          sub: 'U-Net modeli ile bina sınırları tespit ediliyor',  duration: 1800 },
  { label: 'Değişim Analizi',             sub: 'Band farkı ve NDVI karşılaştırması hesaplanıyor',  duration: 1100 },
  { label: 'Hasar Sınıflandırma',         sub: '4-sınıf hasar modeli çalışıyor',                  duration: 1400 },
  { label: 'GeoJSON Dışa Aktarma',        sub: 'Poligon veritabanı ve istatistik raporu',          duration: 700  },
]

const TOTAL_DURATION = STEPS.reduce((a, s) => a + s.duration, 0)

const LOG_LINES = [
  '[INFO]  Pre-TIFF başarıyla okundu',
  '[INFO]  Post-TIFF başarıyla okundu',
  '[INFO]  Band normalizasyonu tamamlandı',
  '[DEBUG] CRS: WGS84 / EPSG:4326',
  '[INFO]  Bina segmentasyonu başlatılıyor…',
  '[DEBUG] Model: UNet-ResNet50',
  '[INFO]  Bina poligonları tespit edildi',
  '[DEBUG] Değişim vektörü hesaplanıyor',
  '[INFO]  Hasar sınıflandırması başlatıldı',
  '[DEBUG] Sınıf dağılımı hesaplanıyor',
  '[INFO]  GeoJSON kaydedildi',
  '[INFO]  Analiz tamamlandı ✓',
]

export default function ProgressPage() {
  const router = useRouter()
  const params = useParams<{ jobId: string }>()
  const { projectName, setAnalysisId } = useAnalysisStore()

  const [activeStep, setActiveStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const completedAnalysisId = useRef<string | null>(null)

  useEffect(() => {
    let elapsed = 0
    let stepIdx = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    const runStep = (i: number) => {
      if (i >= STEPS.length) return
      setActiveStep(i)
      const dur = STEPS[i].duration
      const start = Date.now()
      const tick = () => {
        const frac = Math.min((Date.now() - start) / dur, 1)
        setProgress(Math.round(((elapsed + frac * dur) / TOTAL_DURATION) * 100))
        if (frac < 1) requestAnimationFrame(tick)
        else {
          elapsed += dur
          stepIdx++
          timers.push(setTimeout(() => runStep(stepIdx), 50))
        }
      }
      requestAnimationFrame(tick)
      const target = Math.min((i + 1) * 2, LOG_LINES.length)
      const current = i * 2
      for (let j = current; j < target; j++) {
        timers.push(setTimeout(() => setLogLines((l) => [...l, LOG_LINES[j]]), (j - current) * 220))
      }
    }

    timers.push(setTimeout(() => runStep(0), 400))
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleCompleted = (analysisId: string) => {
    completedAnalysisId.current = analysisId
    setAnalysisId(analysisId)
    setProgress(100)
    setActiveStep(STEPS.length)
    setLogLines(LOG_LINES)
    setTimeout(() => setDone(true), 300)
  }

  useJobSocket({
    jobId: params.jobId,
    onCompleted: handleCompleted,
    onFailed: (err) => setFailed(err),
  })

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header center={<span className="text-[13px] text-[#6b6864] font-mono">{projectName}</span>} />
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[700px] animate-fade-up">
          {failed ? (
            <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
              <div className="text-[15px] font-semibold text-red-700 mb-2">Pipeline Başarısız</div>
              <div className="text-[13px] text-red-500 mb-6">{failed}</div>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 rounded-xl bg-accent text-white text-[14px] font-semibold"
              >
                ← Geri Dön
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
                    Harita ve Dashboard&apos;a Git  →
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
