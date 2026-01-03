/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: "../..",
  },
  reactStrictMode: true,
  transpilePackages: ['@textmesh/brand-identity', '@textmesh/shared-types'],
  images: {
    domains: ['cdn.textmesh.com', 'localhost'],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
