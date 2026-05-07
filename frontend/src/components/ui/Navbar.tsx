'use client'

import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import Link from 'next/link'
import { Logo } from './Logo'

interface NavbarProps {
  session: Session
}

export function Navbar({ session }: NavbarProps) {
  const role = session.user.role

  return (
    <header className="h-14 border-b border-slate-800 flex items-center px-6 gap-4 bg-slate-900/95 backdrop-blur-sm">
      <Link href="/upload">
        <Logo />
      </Link>
      {role === 'admin' && (
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-200 transition-colors ml-2">
          Admin Paneli
        </Link>
      )}
      <div className="flex-1" />
      <span className="text-sm text-slate-400">{session.user?.email}</span>
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          role === 'admin'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
            : 'bg-slate-700 text-slate-300'
        }`}
      >
        {role === 'admin' ? 'Admin' : 'Kullanıcı'}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        Çıkış
      </button>
    </header>
  )
}
