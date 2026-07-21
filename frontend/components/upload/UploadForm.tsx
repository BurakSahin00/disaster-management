'use client'
import { useState, useEffect } from 'react'
import { UploadZone } from './UploadZone'

interface UploadFormProps {
  onStart: (projectName: string, preFile: File, postFile: File) => void
  loading?: boolean
  error?: string | null
  presetProjectName?: string | null
}

const PRESETS = [
  { label: 'Kahramanmaraş 2023', name: 'Kahramanmaras 2023-02-06' },
  { label: 'Hatay Antakya 2023', name: 'Hatay-Antakya 2023-02-06' },
]

export function UploadForm({ onStart, loading, error, presetProjectName }: UploadFormProps) {
  const [projectName, setProjectName] = useState('Kahramanmaras 2023-02-06')
  const [preFile, setPreFile] = useState<File | null>(null)
  const [postFile, setPostFile] = useState<File | null>(null)

  useEffect(() => {
    if (presetProjectName?.trim()) setProjectName(presetProjectName.trim())
  }, [presetProjectName])

  const ready = !!(preFile && postFile && projectName.trim() && !loading)

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">

      {/* Project name */}
      <div className="px-6 pt-6 pb-0">
        <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
          Project Name
        </label>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-border text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-white text-text-primary"
          placeholder="Enter project name…"
        />
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[11px] text-text-faint">Quick select:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setProjectName(p.name)}
              className="px-2.5 py-1 rounded-full text-[11px] border border-border bg-surface text-text-muted hover:border-accent hover:text-accent transition-all font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 my-5 border-t border-border" />

      {/* Upload zones */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-2 gap-3 mb-5">
          <UploadZone label="Pre-Disaster" sublabel="Pre-disaster image" file={preFile} onFile={setPreFile} />
          <UploadZone label="Post-Disaster" sublabel="Post-disaster image" file={postFile} onFile={setPostFile} />
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={() => ready && onStart(projectName, preFile!, postFile!)}
          disabled={!ready}
          className={`w-full py-3 rounded-xl text-[14px] font-semibold tracking-tight transition-all
            ${ready
              ? 'bg-accent text-white shadow-[0_4px_14px_rgba(37,99,235,0.22)] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(37,99,235,0.30)] cursor-pointer'
              : 'bg-surface text-text-faint cursor-not-allowed border border-border'
            }`}
        >
          {loading ? 'Uploading…' : ready ? 'Start Analysis →' : 'Select pre and post TIFF'}
        </button>
      </div>
    </div>
  )
}
