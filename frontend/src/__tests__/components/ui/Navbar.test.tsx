import { render, screen } from '@testing-library/react'
import { Navbar } from '@/components/ui/Navbar'
import type { Session } from 'next-auth'

jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))

const adminSession: Session = {
  user: { email: 'admin@example.com', role: 'admin', name: 'Admin' },
  expires: '2099-01-01',
}

const userSession: Session = {
  user: { email: 'user@example.com', role: 'user', name: 'Kullanıcı' },
  expires: '2099-01-01',
}

describe('Navbar', () => {
  it('shows Admin badge for admin role', () => {
    render(<Navbar session={adminSession} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows Kullanıcı badge for user role', () => {
    render(<Navbar session={userSession} />)
    expect(screen.getByText('Kullanıcı')).toBeInTheDocument()
  })

  it('shows user email', () => {
    render(<Navbar session={adminSession} />)
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
  })
})
