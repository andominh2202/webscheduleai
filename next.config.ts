import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
