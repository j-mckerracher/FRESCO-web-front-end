/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/bulk-download/archives",
        destination: "/api/bulk-download/archives",
      },
      {
        source: "/bulk-download/archives/:path*",
        destination: "/api/bulk-download/archives/:path*",
      },
    ];
  },
};

export default nextConfig;
