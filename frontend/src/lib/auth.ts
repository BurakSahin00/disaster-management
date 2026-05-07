import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const USERS = [
  { id: '1', email: process.env.ADMIN_EMAIL ?? '', password: process.env.ADMIN_PASS ?? '', role: 'admin', name: 'Admin' },
  { id: '2', email: process.env.USER_EMAIL ?? '', password: process.env.USER_PASS ?? '', role: 'user',  name: 'Kullanıcı' },
]

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre',   type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        if (!credentials.email.trim() || !credentials.password.trim()) return null
        const user = USERS.find(
          (u) => u.email === credentials.email && u.password === credentials.password
        )
        return user ?? null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.role = user.role
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.role = token.role ?? 'user'
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
}
