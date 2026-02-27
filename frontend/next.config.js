/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },

  // Extend the Next.js dev-server proxy timeout to 10 minutes.
  // The default is 30 s, which causes ECONNRESET on long HANA queries.
  httpAgentOptions: {
    keepAlive: true,
  },

  experimental: {
    // proxyTimeout is in milliseconds — 10 minutes
    proxyTimeout: 10 * 60 * 1000,
  },
};

module.exports = nextConfig;
