'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadZone } from '@/components/upload/UploadZone'
import { ProgressScreen } from '@/components/upload/ProgressScreen'
import { createJob } from '@/lib/api'

type Phase = 'upload' | 'progress'

export default function UploadPage() {
  const [preFile, setPreFile] = useState<File | null>(null)
  const [postFile, setPostFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('upload')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit() {
    if (!preFile || !postFile) return
    setSubmitError(null)
    setLoading(true)

    try {
      const { id } = await createJob(preFile, postFile)
      setJobId(id)
      setPhase('progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'progress' && jobId) {
    return (
      <ProgressScreen
        jobId={jobId}
        onCompleted={(analysisId) => router.push(`/analyses/${analysisId}`)}
        onFailed={(error) => {
          setSubmitError(error)
          setPhase('upload')
        }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-8">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Yeni Analiz</h1>
          <p className="text-sm text-slate-400 mt-1">
            Pre ve post afet uydu görüntülerini yükleyin (.tif / .tiff)
          </p>
        </div>

        <UploadZone label="Pre-afet görüntü" file={preFile} onFile={setPreFile} />
        <UploadZone label="Post-afet görüntü" file={postFile} onFile={setPostFile} />

        {submitError && (
          <p className="text-red-400 text-sm" role="alert">
            {submitError}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!preFile || !postFile || loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
        >
          {loading ? 'Yükleniyor...' : 'Analiz Başlat'}
        </button>
      </div>
    </div>
  )
}
