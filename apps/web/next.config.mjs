/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: ['@nexus/shared-types', '@nexus/validation'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
