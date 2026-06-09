/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // le configurateur doit pouvoir vivre en iframe sur le site des cuisinistes (embed.js)
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

export default nextConfig;
