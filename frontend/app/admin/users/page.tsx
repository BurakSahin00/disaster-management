'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/useAuthStore'
import { Header } from '@/components/shared/Header'
import { apiGet, apiPost } from '@/lib/api'

type Tab = 'pending' | 'active'

interface PendingRequest {
  id: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface ActiveUser {
  id: string
  email: string
  role: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Yönetici',
  analyst: 'Analist',
  viewer: 'İzleyici',
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-50 text-red-700',
  analyst: 'bg-blue-50 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [users, setUsers] = useState<ActiveUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({})
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'admin') { router.replace('/'); return }

    Promise.all([
      apiGet<PendingRequest[]>('/auth/register-requests?status=pending'),
      apiGet<ActiveUser[]>('/auth/users'),
    ])
      .then(([reqs, activeUsers]) => {
        setRequests(reqs)
        setUsers(activeUsers)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Veriler yüklenemedi'))
      .finally(() => setLoading(false))
  }, [user, router])

  const handleApprove = async (id: string) => {
    const role = selectedRole[id] ?? 'viewer'
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    setActionError((prev) => ({ ...prev, [id]: '' }))
    try {
      await apiPost(`/auth/register-requests/${id}/approve`, { role })
      setRequests((prev) => prev.filter((r) => r.id !== id))
      const updated = await apiGet<ActiveUser[]>('/auth/users')
      setUsers(updated)
    } catch (e) {
      setActionError((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'İşlem başarısız',
      }))
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const handleReject = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    setActionError((prev) => ({ ...prev, [id]: '' }))
    try {
      await apiPost(`/auth/register-requests/${id}/reject`, {
        reason: rejectReason[id] ?? '',
      })
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      setActionError((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'İşlem başarısız',
      }))
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header
        right={
          user ? (
            <div className="flex items-center gap-2">
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

      <div className="flex-1 w-full max-w-[900px] mx-auto px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Kullanıcı Yönetimi</h1>
            <p className="text-[13px] text-text-muted mt-1">
              Kayıt taleplerini onaylayın veya reddedin.
            </p>
          </div>
          <Link
            href="/"
            className="text-[12px] text-text-muted hover:text-accent transition-colors"
          >
            ← Ana Sayfa
          </Link>
        </div>

        <div className="flex gap-1 mb-6 bg-white border border-border rounded-xl p-1 w-fit">
          {(['pending', 'active'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                tab === t ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t === 'pending'
                ? `Bekleyen Talepler${requests.length > 0 ? ` (${requests.length})` : ''}`
                : `Aktif Kullanıcılar${users.length > 0 ? ` (${users.length})` : ''}`}
            </button>
          ))}
        </div>

        {loading && <p className="text-[13px] text-text-muted">Yükleniyor…</p>}

        {error && (
          <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {!loading && tab === 'pending' && (
          <div className="flex flex-col gap-3">
            {requests.length === 0 && (
              <div className="bg-white border border-border rounded-2xl px-6 py-12 text-center text-[13px] text-text-muted">
                Bekleyen kayıt talebi yok.
              </div>
            )}
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-medium text-text-primary">{req.email}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {new Date(req.created_at).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium shrink-0">
                    Bekliyor
                  </span>
                </div>

                {actionError[req.id] && (
                  <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {actionError[req.id]}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedRole[req.id] ?? 'viewer'}
                    onChange={(e) =>
                      setSelectedRole((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    className="px-3 py-2 rounded-lg border border-border text-[12px] bg-white focus:outline-none focus:border-accent"
                  >
                    {(['viewer', 'analyst', 'admin'] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={actionLoading[req.id]}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {actionLoading[req.id] ? 'İşleniyor…' : 'Onayla'}
                  </button>

                  {!showRejectInput[req.id] ? (
                    <button
                      onClick={() =>
                        setShowRejectInput((prev) => ({ ...prev, [req.id]: true }))
                      }
                      disabled={actionLoading[req.id]}
                      className="px-4 py-2 rounded-lg border border-border text-[12px] font-medium text-text-muted hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      Reddet
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Red sebebi (opsiyonel)"
                        value={rejectReason[req.id] ?? ''}
                        onChange={(e) =>
                          setRejectReason((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border text-[12px] focus:outline-none focus:border-red-400"
                      />
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={actionLoading[req.id]}
                        className="px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-[12px] font-semibold hover:bg-red-100 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {actionLoading[req.id] ? '…' : 'Gönder'}
                      </button>
                      <button
                        onClick={() =>
                          setShowRejectInput((prev) => ({ ...prev, [req.id]: false }))
                        }
                        className="text-[11px] text-text-muted hover:text-text-primary px-2 shrink-0"
                      >
                        İptal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'active' && (
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            {users.length === 0 && (
              <p className="px-6 py-12 text-center text-[13px] text-text-muted">
                Aktif kullanıcı yok.
              </p>
            )}
            {users.length > 0 && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                      E-posta
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                      Rol
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                      Kayıt Tarihi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface transition-colors">
                      <td className="px-5 py-3 text-text-primary">{u.email}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {new Date(u.created_at).toLocaleDateString('tr-TR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
