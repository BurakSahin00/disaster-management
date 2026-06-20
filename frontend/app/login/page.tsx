'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'
import { useAuthStore } from '@/store/useAuthStore'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Giriş başarısız')
        return
      }
      login(data.token, data.user)
      router.replace('/')
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <h1 className="text-[20px] font-semibold mt-5 mb-1 text-text-primary">Sisteme Giriş</h1>
          <p className="text-[13px] text-text-muted text-center">
            Hasar analizi yapmak için hesabınıza giriş yapın
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[12px] font-medium text-text-muted mb-1.5">
                E-posta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@disastersense.local"
                className="w-full px-3 py-2.5 rounded-lg border border-border text-[13px] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-muted mb-1.5">
                Şifre
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-border text-[13px] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              />
            </div>

            {error && (
              <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 py-3 rounded-xl bg-accent text-white text-[14px] font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-[11px] text-text-faint text-center">
              Varsayılan: <span className="font-mono">admin@disastersense.local</span> / <span className="font-mono">admin123</span>
            </p>
            <p className="text-[10px] text-text-faint text-center mt-1">
              Üretim ortamında şifreyi değiştirin
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12px] text-text-muted text-center">
          Hesabınız yok mu?{' '}
          <Link href="/register" className="text-accent hover:underline font-medium">
            Talep gönderin →
          </Link>
        </p>

        <div className="mt-4 flex justify-center gap-3">
          {[
            { role: 'admin', color: '#dc2626', label: 'Yönetici' },
            { role: 'analyst', color: '#2563EB', label: 'Analist' },
            { role: 'viewer', color: '#6b7280', label: 'İzleyici' },
          ].map(({ role, color, label }) => (
            <div key={role} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
