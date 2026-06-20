import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*` }]
      : []
  },
}

export default nextConfig
