'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/shared/Header'
import { apiGet } from '@/lib/api'
import { DEFAULT_USER_ID } from '@/lib/constants'
import type { ProjectRow } from '@/types'

export default function ProjectsPage() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<ProjectRow[]>(`/projects?userId=${encodeURIComponent(DEFAULT_USER_ID)}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'))
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header
        right={
          <Link href="/" className="text-[12px] font-medium text-accent hover:underline">
            Yeni analiz
          </Link>
        }
      />
      <div className="flex-1 max-w-[900px] w-full mx-auto px-6 py-10">
        <h1 className="text-[22px] font-semibold tracking-tight mb-1">Projeler</h1>
        <p className="text-[13px] text-[#6b6864] mb-8">
          Aynı proje adı altında yaptığınız tüm TIFF analizlerini buradan görüntüleyin.
        </p>
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}
        {!rows && !error && (
          <div className="text-[13px] text-text-muted">Yükleniyor…</div>
        )}
        {rows && rows.length === 0 && (
          <div className="text-[13px] text-text-muted border border-border rounded-xl p-8 text-center bg-white">
            Henüz proje yok. Ana sayfadan bir proje adı ile analiz başlatın.
          </div>
        )}
        {rows && rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3 hover:border-accent transition-colors"
                >
                  <div>
                    <div className="text-[14px] font-medium text-text-primary">{p.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {p.analysis_count} analiz
                    </div>
                  </div>
                  <span className="text-accent text-[13px] font-medium">Detay →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
