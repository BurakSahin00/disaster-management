import { render, screen, fireEvent } from '@testing-library/react'
import { StatCard } from '@/components/dashboard/StatCard'
import { DamageChart } from '@/components/dashboard/DamageChart'
import { FilterPanel } from '@/components/dashboard/FilterPanel'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Toplam Bina" value="437" />)
    expect(screen.getByText('Toplam Bina')).toBeInTheDocument()
    expect(screen.getByText('437')).toBeInTheDocument()
  })
})

describe('DamageChart', () => {
  it('renders all 4 damage class labels', () => {
    const counts = { 0: 100, 1: 80, 2: 60, 3: 40 }
    const total = 280
    render(<DamageChart counts={counts} total={total} />)
    expect(screen.getByText('Hasarsız')).toBeInTheDocument()
    expect(screen.getByText('Yıkık')).toBeInTheDocument()
  })
})

describe('FilterPanel', () => {
  it('calls onToggle when a class row is clicked', () => {
    const onToggle = jest.fn()
    const filters = { 0: true, 1: true, 2: true, 3: true }
    const counts = { 0: 10, 1: 20, 2: 5, 3: 2 }
    render(<FilterPanel filters={filters} counts={counts} total={37} onToggle={onToggle} onShowAll={jest.fn()} onShowCritical={jest.fn()} />)
    fireEvent.click(screen.getByText('Yıkık').closest('[role="button"]')!)
    expect(onToggle).toHaveBeenCalledWith(3)
  })
})
