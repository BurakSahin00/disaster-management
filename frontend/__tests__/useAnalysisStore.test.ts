import { act, renderHook } from '@testing-library/react'
import { useAnalysisStore } from '@/store/useAnalysisStore'

beforeEach(() => {
  useAnalysisStore.setState({ jobId: null, analysisId: null, projectId: null, projectName: '' })
})

it('setJob updates jobId and projectName', () => {
  const { result } = renderHook(() => useAnalysisStore())
  act(() => result.current.setJob('job-1', 'Test Project'))
  expect(result.current.jobId).toBe('job-1')
  expect(result.current.projectName).toBe('Test Project')
})

it('setAnalysisId updates analysisId', () => {
  const { result } = renderHook(() => useAnalysisStore())
  act(() => result.current.setAnalysisId('analysis-42'))
  expect(result.current.analysisId).toBe('analysis-42')
})
