import { useAuthStore } from '@/store/useAuthStore'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const { token } = useAuthStore.getState()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const key = process.env.NEXT_PUBLIC_API_KEY
  if (key) headers['x-api-key'] = key
  return headers
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `API error ${res.status}`)
  }
  return res.json()
}

export async function apiPost<T = unknown>(path: string, body: FormData | object): Promise<T> {
  const isFormData = body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: isFormData ? body : JSON.stringify(body),
    headers: isFormData
      ? authHeaders()
      : { 'Content-Type': 'application/json', ...authHeaders() },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `API error ${res.status}`)
  }
  return res.json()
}
