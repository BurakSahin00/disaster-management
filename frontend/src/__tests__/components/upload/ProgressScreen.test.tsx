import { render, screen } from '@testing-library/react'
import { ProgressScreen } from '@/components/upload/ProgressScreen'

jest.mock('@/lib/ws', () => ({ useJobSocket: jest.fn() }))

describe('ProgressScreen', () => {
  it('renders all 4 steps', () => {
    render(
      <ProgressScreen jobId="job-1" onCompleted={jest.fn()} onFailed={jest.fn()} />
    )
    expect(screen.getByText('Görüntüler yükleniyor')).toBeInTheDocument()
    expect(screen.getByText('Bina segmentasyonu')).toBeInTheDocument()
    expect(screen.getByText('Poligon çıkarımı')).toBeInTheDocument()
    expect(screen.getByText('Hasar sınıflandırma')).toBeInTheDocument()
  })
})
