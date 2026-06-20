import { apiGet, apiPost } from '@/lib/api'

global.fetch = jest.fn()

beforeEach(() => {
  jest.resetAllMocks()
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001'
})

describe('apiGet', () => {
  it('fetches from the correct URL and returns JSON', async () => {
    const mockData = { id: '123', status: 'completed' }
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    })

    const result = await apiGet('/jobs/123')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/jobs/123',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(result).toEqual(mockData)
  })

  it('throws on non-ok response', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(apiGet('/jobs/missing')).rejects.toThrow('API error 404')
  })
})

describe('apiPost', () => {
  it('sends FormData with POST method', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'abc', status: 'pending' }),
    })

    const fd = new FormData()
    fd.append('key', 'val')
    await apiPost('/jobs', fd)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/jobs',
      expect.objectContaining({ method: 'POST', body: fd })
    )
  })
})
