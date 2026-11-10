import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Since 16.3, `next dev` writes an AGENTS.md into the repo when it detects
  // an AI coding agent. The repo's agent instructions live in CLAUDE.md.
  agentRules: false,
};

export default withNextIntl(nextConfig);
