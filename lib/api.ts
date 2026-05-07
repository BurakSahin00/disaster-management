const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function apiPost<T = unknown>(path: string, body: FormData | object): Promise<T> {
  const isFormData = body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: isFormData ? body : JSON.stringify(body),
    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
