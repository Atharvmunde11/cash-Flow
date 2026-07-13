import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.8"],
  output: "standalone",
  images: {
    unoptimized: true,
  },
  // Security & Best Practices
  reactStrictMode: true,
  poweredByHeader: false,

  // Native modules + Prisma: ensure standalone trace includes binaries and generated client
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/**/*", "./node_modules/.prisma/**/*"],
  },

  // Package Management
  serverExternalPackages: ["pdfkit", "better-sqlite3"],

  // Modern Compiler Options
  compiler: {
    // This replaces the need for manual minification flags
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  experimental: {
    // Improves build performance for large libraries
    optimizePackageImports: ["lucide-react"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
