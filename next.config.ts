import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ALLOWED_ADMIN_EMAILS:
      process.env.NEXT_PUBLIC_ALLOWED_ADMIN_EMAILS
      ?? process.env.ALLOWED_ADMIN_EMAILS
      ?? '',
  },

  serverExternalPackages: ['pdf2json', 'pdf-parse', 'pdfjs-dist'],

  turbopack: {},

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'pdf2json',
        'pdf-parse',
        'canvas',
      ];
    }
    return config;
  },
};

export default nextConfig;
