/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't scatter generated AGENTS.md / CLAUDE.md through the submission repo.
  agentRules: false,
  // The SDK ships ESM + its own `src/`; let Next compile it rather than treat it
  // as a prebuilt external, so browser bundles resolve its subpath exports.
  transpilePackages: ["@somnia-chain/markets-sdk"],
};

export default nextConfig;
