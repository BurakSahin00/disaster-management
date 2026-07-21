'use client'
import { useEffect, useRef } from 'react'
import { apiGet } from './api'
import type { JobResponse } from '@/types'

interface UseJobSocketOptions {
  jobId: string
  onCompleted: (analysisId: string) => void
  onFailed: (error: string) => void
  onLog?: (line: string) => void
}

export function useJobSocket({ jobId, onCompleted, onFailed, onLog }: UseJobSocketOptions) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startPolling = () => {
    let consecutiveErrors = 0
    pollRef.current = setInterval(async () => {
      try {
        const job = await apiGet<JobResponse>(`/jobs/${jobId}`)
        consecutiveErrors = 0
        if (job.status === 'completed') {
          clearInterval(pollRef.current!)
          onCompleted(job.analysis_id ?? '')
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current!)
          onFailed(job.error ?? 'Pipeline failed')
        }
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 5) {
          clearInterval(pollRef.current!)
          onFailed('Could not connect to server. Check your connection and reload the page.')
        }
      }
    }, 3000)
  }

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    const wsUrl = base.replace(/^http/, 'ws') + `/ws?jobId=${jobId}`

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'job.log' && onLog) onLog(msg.line)
          if (msg.type === 'job.completed') onCompleted(msg.analysisId)
          if (msg.type === 'job.failed') onFailed(msg.error ?? 'Pipeline failed')
        } catch {}
      }

      ws.onerror = () => startPolling()
    } catch {
      startPolling()
    }

    return () => {
      ws?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobId])
}
