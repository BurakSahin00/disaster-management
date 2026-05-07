import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const isAdmin = req.nextauth.token?.role === 'admin'
    const isAdminRoute = req.nextUrl.pathname.startsWith('/admin')

    if (isAdminRoute && !isAdmin) {
      return NextResponse.redirect(new URL('/upload', req.url))
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/upload/:path*', '/analyses/:path*', '/admin/:path*'],
}
