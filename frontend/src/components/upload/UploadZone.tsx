'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface UploadZoneProps {
  label: string
  file: File | null
  onFile: (file: File) => void
}

export function UploadZone({ label, file, onFile }: UploadZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/tiff': ['.tif', '.tiff'] },
    maxFiles: 1,
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors select-none ${
        isDragActive
          ? 'border-blue-500 bg-blue-600/10'
          : file
            ? 'border-green-500 bg-green-600/10'
            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'
      }`}
    >
      <input {...getInputProps()} />
      <p className="text-sm text-slate-400 mb-2 font-medium">{label}</p>
      {file ? (
        <p className="text-sm font-mono text-green-400 truncate">{file.name}</p>
      ) : (
        <p className="text-xs text-slate-500">
          {isDragActive ? 'Bırak...' : '.tif veya .tiff dosyasını sürükle ya da tıkla'}
        </p>
      )}
    </div>
  )
}
