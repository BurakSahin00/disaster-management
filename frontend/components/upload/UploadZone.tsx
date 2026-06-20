'use client'
import { useRef, useState } from 'react'

interface UploadZoneProps {
  label: string
  sublabel?: string
  file: File | null
  onFile: (file: File) => void
}

export function UploadZone({ label, sublabel, file, onFile }: UploadZoneProps) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      role="button"
      aria-label={label}
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className={`
        flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
        py-8 px-4 cursor-pointer transition-all select-none
        ${file
          ? 'border-accent bg-accent-light'
          : drag
          ? 'border-accent bg-blue-50'
          : 'border-border bg-surface hover:border-accent/50 hover:bg-white'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".tif,.tiff"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
      />

      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${file ? 'bg-accent' : 'bg-white border border-border'}`}>
        {file ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="text-center">
        <div className={`text-[13px] font-semibold ${file ? 'text-accent' : 'text-text-primary'}`}>
          {label}
        </div>
        {sublabel && !file && (
          <div className="text-[11px] text-text-muted mt-0.5">{sublabel}</div>
        )}
        {file ? (
          <div className="text-[11px] text-accent mt-1 font-mono truncate max-w-[130px]">
            {file.name.length > 22 ? file.name.slice(0, 19) + '…' : file.name}
          </div>
        ) : (
          <div className="text-[10px] text-text-faint mt-1">.tif / .tiff</div>
        )}
      </div>
    </div>
  )
}
