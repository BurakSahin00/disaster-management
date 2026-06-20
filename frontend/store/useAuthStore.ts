import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'analyst' | 'viewer'
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  _hasHydrated: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,
      login: (token, user) => set({ token, user, _hasHydrated: true }),
      logout: () => set({ token: null, user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'disastersense-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        }
      ),
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        // state is undefined when localStorage has no stored data (first visit)
        if (state) {
          state.setHasHydrated(true)
        } else {
          useAuthStore.setState({ _hasHydrated: true })
        }
      },
    }
  )
)
