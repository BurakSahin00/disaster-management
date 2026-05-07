import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import type { Job } from '@/types'

async function fetchJobs(): Promise<Job[]> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${base}/jobs`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<Job[]>
  } catch {
    return []
  }
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') redirect('/upload')

  const jobs = await fetchJobs()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Admin Paneli</h1>
      <p className="text-sm text-slate-400 mb-8">Tüm analiz işleri</p>

      <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/80">
              <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-4 py-3">Job ID</th>
              <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-4 py-3">Durum</th>
              <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-4 py-3">Tarih</th>
              <th className="text-left text-xs text-slate-400 uppercase tracking-wider px-4 py-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-12 text-sm">
                  Henüz işlem yok
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{job.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        job.status === 'completed'
                          ? 'bg-green-600/20 text-green-400'
                          : job.status === 'failed'
                            ? 'bg-red-600/20 text-red-400'
                            : job.status === 'running'
                              ? 'bg-blue-600/20 text-blue-400'
                              : 'bg-slate-600/40 text-slate-400'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(job.created_at).toLocaleDateString('tr-TR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {job.analysis_id ? (
                      <Link href={`/analyses/${job.analysis_id}`} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                        Haritaya Git →
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
