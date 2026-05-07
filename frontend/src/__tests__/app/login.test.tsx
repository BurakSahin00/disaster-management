import { render, screen, fireEvent } from '@testing-library/react'
import LoginPage from '@/app/(auth)/login/page'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn().mockResolvedValue({ error: null }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/e-posta/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/şifre/i)).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /giriş yap/i })).toBeInTheDocument()
  })

  it('shows error on failed login', async () => {
    const { signIn } = require('next-auth/react')
    signIn.mockResolvedValueOnce({ error: 'CredentialsSignin' })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/e-posta/i), { target: { value: 'wrong@test.com' } })
    fireEvent.change(screen.getByLabelText(/şifre/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByText(/geçersiz/i)).toBeInTheDocument()
  })
})
