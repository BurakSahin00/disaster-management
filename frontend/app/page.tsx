'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { UploadForm } from '@/components/upload/UploadForm'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { apiGet, apiPost } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { JobResponse, ProjectRow } from '@/types'

export default function UploadPage() {
  const router = useRouter()
  const setJob = useAnalysisStore((s) => s.setJob)
  const { user, logout } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [presetProjectName, setPresetProjectName] = useState<string | null>(null)

  const loadProjects = useCallback(() => {
    apiGet<ProjectRow[]>('/projects')
      .then((rows) => { setProjects(rows); setProjectsError(null) })
      .catch((e) => {
        setProjects([])
        setProjectsError(e instanceof Error ? e.message : 'Projeler yüklenemedi')
      })
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleStart = async (projectName: string, preFile: File, postFile: File) => {
    setLoading(true)
    setError(null)
    try {
      const project = await apiPost<{ id: string; name: string }>('/projects', {
        name: projectName.trim(),
      })
      const fd = new FormData()
      fd.append('pre', preFile)
      fd.append('post', postFile)
      fd.append('userId', user?.id ?? 'system')
      fd.append('projectId', project.id)
      const job = await apiPost<JobResponse>('/jobs', fd)
      setJob(job.id, project.name, project.id)
      router.push(`/jobs/${job.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dosya yüklenemedi. Backend çalışıyor mu?')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header
        right={
          user ? (
            <div className="flex items-center gap-2">
              {user.role === 'admin' && (
                <Link
                  href="/admin/users"
                  className="text-[11px] font-medium text-text-muted hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-accent-light"
                >
                  Kullanıcılar
                </Link>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[12px] text-text-primary font-medium">{user.email}</span>
                <span className="text-[10px] text-text-faint capitalize">{user.role}</span>
              </div>
              <button
                onClick={() => { logout(); router.replace('/login') }}
                className="text-[11px] text-text-muted hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              >
                Çıkış
              </button>
            </div>
          ) : null
        }
      />

      <div className="flex-1 w-full max-w-[1200px] mx-auto px-5 sm:px-8 py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">

          {/* Sol: TIFF yükleme */}
          <section className="flex flex-col animate-fade-up">
            <div className="mb-5">
              <h1 className="text-[22px] font-semibold tracking-tight mb-1">Yeni Analiz</h1>
              <p className="text-[13px] text-text-muted">
                Pre ve post afet TIFF yükleyin. Proje adını sağdaki listeden de seçebilirsiniz.
              </p>
            </div>
            <UploadForm
              onStart={handleStart}
              loading={loading}
              error={error}
              presetProjectName={presetProjectName}
            />
            <div className="flex gap-3 mt-4 flex-wrap">
              {['SegFormer segmentasyon', '4-sınıf hasar modeli', 'GeoJSON çıktı', 'PostGIS'].map((t) => (
                <span key={t} className="text-[11px] text-text-faint flex items-center gap-1.5">
                  <svg width="6" height="6" viewBox="0 0 6 6">
                    <circle cx="3" cy="3" r="3" fill="#d1cfc8" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Sağ: proje listesi */}
          <aside className="flex flex-col lg:sticky lg:top-8 animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-[22px] font-semibold tracking-tight">Projeler</h2>
                <p className="text-[13px] text-text-muted mt-0.5">
                  {projects === null
                    ? 'Yükleniyor…'
                    : projects.length === 0
                    ? 'Henüz proje yok'
                    : `${projects.length} proje`}
                </p>
              </div>
              <button
                type="button"
                onClick={loadProjects}
                className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-accent-light"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                Yenile
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              {projectsError && (
                <div className="px-5 py-3.5 text-[12px] text-red-600 bg-red-50 border-b border-border">
                  {projectsError}
                </div>
              )}

              {projects === null && !projectsError && (
                <div className="px-5 py-12 text-center text-[13px] text-text-muted">
                  Yükleniyor…
                </div>
              )}

              {projects?.length === 0 && !projectsError && (
                <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a8a49f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-text-primary">Henüz proje yok</p>
                    <p className="text-[12px] text-text-muted mt-0.5 leading-relaxed">
                      Soldan bir analiz başlatarak<br />ilk projenizi oluşturun.
                    </p>
                  </div>
                </div>
              )}

              {projects && projects.length > 0 && (
                <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
                  {projects.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors group">
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setPresetProjectName(p.name)}
                          className="text-left w-full"
                          title="Proje adını forma uygula"
                        >
                          <div className="text-[13px] font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            {p.analysis_count} analiz
                          </div>
                        </button>
                      </div>
                      <Link
                        href={`/projects/${p.id}`}
                        className="shrink-0 text-[11px] font-medium text-accent hover:underline px-2.5 py-1.5 rounded-lg hover:bg-accent-light transition-colors"
                      >
                        Detay →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {projects && projects.length > 0 && (
              <p className="mt-2.5 text-[11px] text-text-faint px-1">
                Proje adına tıklayınca &quot;Proje Adı&quot; alanı güncellenir.
              </p>
            )}
          </aside>

        </div>
      </div>
    </div>
  )
}
