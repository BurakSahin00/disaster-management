'use client'
import { useRef, useState } from 'react'

interface UploadZoneProps {
  label: string
  file: File | null
  onFile: (file: File) => void
}

export function UploadZone({ label, file, onFile }: UploadZoneProps) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  const border = file
    ? 'border-accent bg-accent-light'
    : drag
    ? 'border-accent bg-blue-50'
    : 'border-[#d1cfc8] bg-white'

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
      className={`flex-1 border-2 border-dashed rounded-xl p-7 cursor-pointer transition-all flex flex-col items-center gap-2.5 ${border}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".tif,.tiff"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]) }}
      />
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${file ? 'bg-accent' : 'bg-[#f0ede8]'}`}>
        {file ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>
      <div className="text-center">
        <div className={`font-semibold text-[13px] ${file ? 'text-accent' : 'text-text-primary'}`}>{label}</div>
      </div>
      {file ? (
        <div className="text-[11px] text-accent bg-blue-100 px-2.5 py-1 rounded-full font-mono truncate max-w-[180px]">
          {file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name}
        </div>
      ) : (
        <div className="text-[11px] text-text-faint text-center leading-relaxed">
          .tif / .tiff<br />Sürükleyip bırakın veya tıklayın
        </div>
      )}
    </div>
  )
}
