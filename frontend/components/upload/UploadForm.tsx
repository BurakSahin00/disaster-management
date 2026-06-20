'use client'
import { useState } from 'react'
import { UploadZone } from './UploadZone'

interface UploadFormProps {
  onStart: (projectName: string, preFile: File, postFile: File) => void
  loading?: boolean
  error?: string | null
}

const PRESETS = [
  { label: 'Kahramanmaraş 2023', name: 'Kahramanmaraş 2023-02-06' },
  { label: 'Hatay Antakya 2023', name: 'Hatay-Antakya 2023-02-06' },
]

export function UploadForm({ onStart, loading, error }: UploadFormProps) {
  const [projectName, setProjectName] = useState('Kahramanmaraş 2023-02-06')
  const [preFile, setPreFile] = useState<File | null>(null)
  const [postFile, setPostFile] = useState<File | null>(null)

  const ready = !!(preFile && postFile && projectName.trim() && !loading)

  const handleSubmit = () => {
    if (ready) onStart(projectName, preFile!, postFile!)
  }

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Preset bar */}
      <div className="px-6 py-3 bg-[#faf9f7] border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-text-muted mr-1">Hızlı yükle (proje adı):</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setProjectName(p.name)}
            className="px-3 py-1 rounded-full text-[12px] border border-[#d1cfc8] bg-white text-[#444] hover:border-accent hover:text-accent transition-all font-medium"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="px-7 py-8">
        {/* Project name */}
        <div className="mb-6">
          <label className="block text-[12px] font-medium text-[#6b6864] mb-1.5 uppercase tracking-wide">
            Proje Adı
          </label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#d1cfc8] text-sm outline-none focus:border-accent transition-colors bg-white text-text-primary"
          />
        </div>

        {/* Upload zones */}
        <div className="flex gap-3.5 mb-6">
          <UploadZone label="Pre-Afet Görüntüsü" file={preFile} onFile={setPreFile} />
          <div className="flex items-center justify-center w-8 shrink-0 text-[#c0bdb7]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <UploadZone label="Post-Afet Görüntüsü" file={postFile} onFile={setPostFile} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={!ready}
          className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-all tracking-tight
            ${ready
              ? 'bg-accent text-white shadow-[0_4px_14px_rgba(37,99,235,0.27)] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(37,99,235,0.33)] cursor-pointer'
              : 'bg-[#e5e3df] text-[#a8a49f] cursor-not-allowed'
            }`}
        >
          {loading
            ? 'Yükleniyor…'
            : ready
            ? '→  Analizi Başlat'
            : 'Pre ve post TIFF dosyalarını yükleyin'}
        </button>
      </div>
    </div>
  )
}
