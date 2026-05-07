import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/ui/StatCard'

describe('StatCard', () => {
  it('renders label, value and percentage', () => {
    render(<StatCard label="Hasarsız" value={150} percentage={62.5} color="#22c55e" />)
    expect(screen.getByText('Hasarsız')).toBeInTheDocument()
    expect(screen.getByText('150 (62.5%)')).toBeInTheDocument()
  })

  it('shows 0% when value is 0', () => {
    render(<StatCard label="Yıkık" value={0} percentage={0} color="#ef4444" />)
    expect(screen.getByText('0 (0.0%)')).toBeInTheDocument()
  })
})
