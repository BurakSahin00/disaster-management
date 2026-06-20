'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor')
      return
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${BASE}/auth/register-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Talep gönderilemedi')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border text-[13px] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <h1 className="text-[20px] font-semibold mt-5 mb-1 text-text-primary">Kayıt Talebi</h1>
          <p className="text-[13px] text-text-muted text-center">
            Talebiniz admin onayından sonra aktive edilecek
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-text-primary">Talebiniz alındı</p>
                <p className="text-[12px] text-text-muted mt-1">
                  Admin onayından sonra giriş yapabilirsiniz.
                </p>
              </div>
              <Link href="/login" className="text-[13px] font-medium text-accent hover:underline">
                Giriş sayfasına dön →
              </Link>
            </div>
          ) : (
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
                  placeholder="ornek@kurum.com"
                  className={inputClass}
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
                  placeholder="En az 6 karakter"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-text-muted mb-1.5">
                  Şifre Tekrar
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
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
                {loading ? 'Gönderiliyor…' : 'Talep Gönder'}
              </button>
            </form>
          )}
        </div>

        {!submitted && (
          <p className="mt-4 text-[12px] text-text-muted text-center">
            Zaten hesabınız var mı?{' '}
            <Link href="/login" className="text-accent hover:underline font-medium">
              Giriş yapın →
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
