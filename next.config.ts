import type { NextConfig } from 'next';
const nextConfig: NextConfig = { reactStrictMode: true, serverExternalPackages:['pdfkit'], outputFileTracingIncludes:{'/*':['./assets/fonts/*.ttf']}, experimental: {serverActions:{bodySizeLimit:'4mb'}} };
export default nextConfig;
