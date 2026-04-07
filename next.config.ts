import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose", "tesseract.js"],
  allowedDevOrigins: ["192.168.56.1"],
  devIndicators: false,
};

export default nextConfig;
