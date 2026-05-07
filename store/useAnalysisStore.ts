import { create } from 'zustand'

interface AnalysisState {
  jobId: string | null
  analysisId: string | null
  projectName: string
  setJob: (jobId: string, projectName: string) => void
  setAnalysisId: (analysisId: string) => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  jobId: null,
  analysisId: null,
  projectName: '',
  setJob: (jobId, projectName) => set({ jobId, projectName }),
  setAnalysisId: (analysisId) => set({ analysisId }),
}))
