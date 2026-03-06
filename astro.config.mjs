import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',

  // pages.dev(테스트) → blog.gitsam.com(실배포) 전환을 env로 관리
  site: import.meta.env.SITE_URL,

  adapter: cloudflare(),
});