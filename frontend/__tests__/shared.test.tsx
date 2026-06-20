import { render, screen } from '@testing-library/react'
import { Logo } from '@/components/shared/Logo'
import { Header } from '@/components/shared/Header'
import { Tag } from '@/components/shared/Tag'

describe('Logo', () => {
  it('renders DisasterSense wordmark', () => {
    render(<Logo />)
    expect(screen.getByText(/Disaster/i)).toBeInTheDocument()
    expect(screen.getByText(/Sense/i)).toBeInTheDocument()
  })
})

describe('Header', () => {
  it('always renders Logo', () => {
    render(<Header />)
    expect(screen.getByText(/Disaster/i)).toBeInTheDocument()
  })

  it('renders center and right slots when provided', () => {
    render(<Header center={<span>CenterSlot</span>} right={<button>RightBtn</button>} />)
    expect(screen.getByText('CenterSlot')).toBeInTheDocument()
    expect(screen.getByText('RightBtn')).toBeInTheDocument()
  })
})

describe('Tag', () => {
  it('renders label with colored dot', () => {
    render(<Tag color="#dc2626" light="#fee2e2" border="#fecaca" label="Yıkık" />)
    expect(screen.getByText('Yıkık')).toBeInTheDocument()
  })
})
