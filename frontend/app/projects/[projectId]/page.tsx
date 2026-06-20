'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { apiGet } from '@/lib/api'
import type { ProjectAnalysesResponse } from '@/types'

function fileBase(path: string | null): string {
  if (!path) return '—'
  const n = path.replace(/\\/g, '/').split('/').pop()
  return n || path
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()

  const [data, setData] = useState<ProjectAnalysesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.projectId) return
    apiGet<ProjectAnalysesResponse>(`/projects/${params.projectId}/analyses`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'))
  }, [params.projectId])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header
        center={
          data ? (
            <span className="text-[13px] text-[#6b6864] font-medium truncate max-w-[280px]">
              {data.project.name}
            </span>
          ) : null
        }
        right={
          <div className="flex items-center gap-3">
            <Link href="/projects" className="text-[12px] text-text-muted hover:text-accent">
              Tüm projeler
            </Link>
            <Link href="/" className="text-[12px] font-medium text-accent hover:underline">
              Yeni analiz
            </Link>
          </div>
        }
      />
      <div className="flex-1 w-full max-w-[1000px] mx-auto px-6 py-8">
        <h1 className="text-[20px] font-semibold mb-1">Proje analizleri</h1>
        <p className="text-[13px] text-[#6b6864] mb-6">
          Bu proje altında kayıtlı tüm TIFF çiftleri ve durumları. Tamamlanan analizlerde haritaya gidebilirsiniz.
        </p>
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}
        {!data && !error && <div className="text-[13px] text-text-muted">Yükleniyor…</div>}
        {data && data.items.length === 0 && (
          <div className="text-[13px] text-text-muted border border-border rounded-xl p-8 text-center bg-white">
            Bu projede henüz analiz yok.
          </div>
        )}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#faf9f7] text-text-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Durum</th>
                  <th className="px-3 py-2.5 font-medium">Pre TIFF</th>
                  <th className="px-3 py-2.5 font-medium">Post TIFF</th>
                  <th className="px-3 py-2.5 font-medium">Tarih</th>
                  <th className="px-3 py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.analysis_id} className="border-b border-[#f0ede8] last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px]">{row.analysis_status}</span>
                      {row.job_status && (
                        <span className="text-text-faint text-[11px] ml-1">/ {row.job_status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] max-w-[200px] truncate" title={row.job_pre_path ?? ''}>
                      {fileBase(row.job_pre_path)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] max-w-[200px] truncate" title={row.job_post_path ?? ''}>
                      {fileBase(row.job_post_path)}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">
                      {row.job_created_at
                        ? new Date(row.job_created_at).toLocaleString('tr-TR')
                        : new Date(row.analysis_created_at).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {row.job_id && (
                        <Link
                          href={`/jobs/${row.job_id}`}
                          className="text-accent font-medium hover:underline mr-2"
                        >
                          İş
                        </Link>
                      )}
                      {row.analysis_status === 'completed' && (
                        <Link
                          href={`/map/${row.analysis_id}`}
                          className="text-accent font-medium hover:underline"
                        >
                          Harita
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
