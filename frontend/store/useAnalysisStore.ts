import { create } from 'zustand'

interface AnalysisState {
  jobId: string | null
  analysisId: string | null
  projectId: string | null
  projectName: string
  setJob: (jobId: string, projectName: string, projectId?: string | null) => void
  setAnalysisId: (analysisId: string) => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  jobId: null,
  analysisId: null,
  projectId: null,
  projectName: '',
  setJob: (jobId, projectName, projectId = null) =>
    set({ jobId, projectName, projectId: projectId ?? null }),
  setAnalysisId: (analysisId) => set({ analysisId }),
}))
