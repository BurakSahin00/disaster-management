import { renderHook, act } from '@testing-library/react'
import { useJobSocket } from '@/lib/useJobSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1
  close = jest.fn()
  constructor(public url: string) { MockWebSocket.instances.push(this) }
  send = jest.fn()
}

beforeEach(() => {
  MockWebSocket.instances = []
  ;(global as any).WebSocket = MockWebSocket
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001'
})

it('calls onCompleted when job.completed message arrives', () => {
  const onCompleted = jest.fn()
  const onFailed = jest.fn()
  renderHook(() => useJobSocket({ jobId: 'job-1', onCompleted, onFailed }))

  const ws = MockWebSocket.instances[0]
  act(() => {
    ws.onmessage?.({ data: JSON.stringify({ type: 'job.completed', analysisId: 'analysis-1' }) } as MessageEvent)
  })

  expect(onCompleted).toHaveBeenCalledWith('analysis-1')
})

it('calls onFailed when job.failed message arrives', () => {
  const onCompleted = jest.fn()
  const onFailed = jest.fn()
  renderHook(() => useJobSocket({ jobId: 'job-2', onCompleted, onFailed }))

  const ws = MockWebSocket.instances[0]
  act(() => {
    ws.onmessage?.({ data: JSON.stringify({ type: 'job.failed', error: 'Pipeline crashed' }) } as MessageEvent)
  })

  expect(onFailed).toHaveBeenCalledWith('Pipeline crashed')
})

it('connects to correct WebSocket URL', () => {
  renderHook(() => useJobSocket({ jobId: 'job-3', onCompleted: jest.fn(), onFailed: jest.fn() }))
  expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3001/ws?jobId=job-3')
})
