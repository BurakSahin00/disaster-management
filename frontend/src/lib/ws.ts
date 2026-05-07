import { useEffect } from 'react'

type WsMessage =
  | { type: 'job.status'; jobId: string; status: string }
  | { type: 'job.completed'; jobId: string; analysisId: string }
  | { type: 'job.failed'; jobId: string; error: string }

interface UseJobSocketOptions {
  onStatus: (status: string) => void
  onCompleted: (analysisId: string) => void
  onFailed: (error: string) => void
}

export function useJobSocket(jobId: string | null, options: UseJobSocketOptions) {
  const { onStatus, onCompleted, onFailed } = options

  useEffect(() => {
    if (!jobId) return

    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws')
    const ws = new WebSocket(`${base}/ws?jobId=${jobId}`)

    ws.onmessage = (event: MessageEvent) => {
      const msg: WsMessage = JSON.parse(event.data as string)
      if (msg.type === 'job.status') onStatus(msg.status)
      else if (msg.type === 'job.completed') onCompleted(msg.analysisId)
      else if (msg.type === 'job.failed') onFailed(msg.error)
    }

    return () => ws.close()
  }, [jobId, onStatus, onCompleted, onFailed])
}
