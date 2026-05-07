import { render, screen } from '@testing-library/react'
import { Tag } from '@/components/ui/Tag'

describe('Tag', () => {
  it('renders label', () => {
    render(<Tag label="Ağır Hasarlı" color="#f97316" />)
    expect(screen.getByText('Ağır Hasarlı')).toBeInTheDocument()
  })
})
