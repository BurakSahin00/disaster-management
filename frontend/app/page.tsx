'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { UploadForm } from '@/components/upload/UploadForm'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { apiPost } from '@/lib/api'
import type { JobResponse } from '@/types'

export default function UploadPage() {
  const router = useRouter()
  const setJob = useAnalysisStore((s) => s.setJob)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async (projectName: string, preFile: File, postFile: File) => {
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('pre', preFile)
      fd.append('post', postFile)
      const job = await apiPost<JobResponse>('/jobs', fd)
      setJob(job.id, projectName)
      router.push(`/jobs/${job.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dosya yüklenemedi. Backend çalışıyor mu?')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header right={<span className="text-[12px] text-text-faint">v1.0 · Akademik Araştırma Modu</span>} />
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[760px] animate-fade-up">
          <div className="mb-8 text-center">
            <h1 className="text-[26px] font-semibold tracking-tight mb-1.5">Yeni Analiz Projesi</h1>
            <p className="text-[14px] text-[#6b6864]">
              Pre ve post afet TIFF görüntülerini yükleyerek bina hasar analizini başlatın
            </p>
          </div>
          <UploadForm onStart={handleStart} loading={loading} error={error} />
          <div className="flex gap-2 mt-4 justify-center flex-wrap">
            {['U-Net segmentasyon', '4-sınıf hasar modeli', 'GeoJSON çıktı', 'PostGIS'].map((t) => (
              <span key={t} className="text-[11px] text-text-faint flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#d1cfc8" /></svg>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
