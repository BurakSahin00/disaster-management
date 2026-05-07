import { renderHook, act } from '@testing-library/react'
import { useJobSocket } from '@/lib/ws'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  closed = false
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() { this.closed = true }
}

beforeEach(() => {
  MockWebSocket.instances = []
  ;(global as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket
})

describe('useJobSocket', () => {
  it('connects with correct URL when jobId is provided', () => {
    const onStatus = jest.fn()
    const onCompleted = jest.fn()
    const onFailed = jest.fn()

    renderHook(() => useJobSocket('job-123', { onStatus, onCompleted, onFailed }))

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toContain('jobId=job-123')
  })

  it('calls onCompleted with analysisId on job.completed message', () => {
    const onCompleted = jest.fn()

    renderHook(() =>
      useJobSocket('job-123', { onStatus: jest.fn(), onCompleted, onFailed: jest.fn() })
    )

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'job.completed', jobId: 'job-123', analysisId: 'analysis-456' }),
      })
    })

    expect(onCompleted).toHaveBeenCalledWith('analysis-456')
  })

  it('calls onFailed with error on job.failed message', () => {
    const onFailed = jest.fn()

    renderHook(() =>
      useJobSocket('job-123', { onStatus: jest.fn(), onCompleted: jest.fn(), onFailed })
    )

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'job.failed', jobId: 'job-123', error: 'Pipeline error' }),
      })
    })

    expect(onFailed).toHaveBeenCalledWith('Pipeline error')
  })

  it('does not connect when jobId is null', () => {
    renderHook(() =>
      useJobSocket(null, { onStatus: jest.fn(), onCompleted: jest.fn(), onFailed: jest.fn() })
    )
    expect(MockWebSocket.instances).toHaveLength(0)
  })
})
