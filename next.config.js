/** @type {import('next').NextConfig} */
const nextConfig = {
  // VULN [Cat 8 - CORS]: Wildcard origin with credentials allowed
  // VULN [Cat 32]: No Content-Security-Policy header - allows XSS, inline scripts, unsafe eval
  // VULN [Cat 32]: No Strict-Transport-Security (HSTS) - allows downgrade to HTTP
  // VULN [Cat 32]: No X-Frame-Options - allows clickjacking via iframes
  // VULN [Cat 32]: No X-Content-Type-Options - allows MIME-type sniffing attacks
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          // VULN [Cat 32]: Intentionally missing security headers:
          // - Content-Security-Policy
          // - Strict-Transport-Security
          // - X-Frame-Options
          // - X-Content-Type-Options
          // - Referrer-Policy
          // - Permissions-Policy
        ],
      },
    ];
  },
};

module.exports = nextConfig;
