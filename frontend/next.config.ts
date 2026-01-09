import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8080",
        pathname: "/**",
        search: "",
      },
    ],
  },
  env: {
    API_URL: process.env.API_URL,
    SSL_CERT: process.env.SSL_CERT,
    SSL_KEY: process.env.SSL_KEY,
  },
};

export default nextConfig;
