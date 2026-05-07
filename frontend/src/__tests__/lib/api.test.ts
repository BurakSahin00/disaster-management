import { createJob, getBuildings } from '@/lib/api'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => mockFetch.mockReset())

describe('createJob', () => {
  it('POSTs to /jobs with FormData and returns id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'job-123', status: 'pending' }),
    })

    const pre = new File([''], 'pre.tif', { type: 'image/tiff' })
    const post = new File([''], 'post.tif', { type: 'image/tiff' })
    const result = await createJob(pre, post)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/jobs'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result.id).toBe('job-123')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const pre = new File([''], 'pre.tif')
    const post = new File([''], 'post.tif')
    await expect(createJob(pre, post)).rejects.toThrow('500')
  })
})

describe('getBuildings', () => {
  it('fetches buildings with bbox param', async () => {
    const mockGeoJSON = { type: 'FeatureCollection', features: [] }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockGeoJSON })

    const result = await getBuildings('analysis-1', '28,39,29,40')

    const callUrl = mockFetch.mock.calls[0][0]
    expect(callUrl).toContain('bbox=28,39,29,40')
    expect(result.type).toBe('FeatureCollection')
  })
})
