import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large audio uploads (up to 25MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },

  // Server-side packages
  serverExternalPackages: ['pdf-lib', '@pdf-lib/fontkit'],

  // Security headers for Telegram Mini App
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow Telegram to embed this app
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          // Content Security Policy for Telegram
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *; default-src 'self' https://telegram.org; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.telegram.org; media-src 'self' blob:; img-src 'self' data: blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
