import { render, screen, fireEvent } from '@testing-library/react'
import { StatsPanel } from '@/components/map/StatsPanel'
import type { GeoJSONFeatureCollection } from '@/types'

const mockBuildings: GeoJSONFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [] }, properties: { damage_class: 0 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [] }, properties: { damage_class: 0 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [] }, properties: { damage_class: 3 } },
  ],
}

const defaultProps = {
  buildings: mockBuildings,
  showBuildings: true,
  showRegions: false,
  showClusters: false,
  onToggleBuildings: jest.fn(),
  onToggleRegions: jest.fn(),
  onToggleClusters: jest.fn(),
}

describe('StatsPanel', () => {
  it('shows total building count', () => {
    render(<StatsPanel {...defaultProps} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('calls toggle callback on layer button click', () => {
    const onToggleRegions = jest.fn()
    render(<StatsPanel {...defaultProps} onToggleRegions={onToggleRegions} />)
    fireEvent.click(screen.getByText('Bölgeler'))
    expect(onToggleRegions).toHaveBeenCalledTimes(1)
  })

  it('shows 0 buildings when no data', () => {
    render(<StatsPanel {...defaultProps} buildings={null} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
