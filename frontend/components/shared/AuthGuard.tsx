'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'

const PUBLIC_PATHS = ['/login', '/register']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const _hasHydrated = useAuthStore((s) => s._hasHydrated)
  const router = useRouter()
  const pathname = usePathname()

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  useEffect(() => {
    if (_hasHydrated && !token && !isPublic) {
      router.replace('/login')
    }
  }, [_hasHydrated, token, isPublic])

  // Avoid flash: show nothing until hydration is complete
  if (!_hasHydrated && !isPublic) return null

  // Not authenticated and not on a public page — redirect already triggered above
  if (_hasHydrated && !token && !isPublic) return null

  return <>{children}</>
}
