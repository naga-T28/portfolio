import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://naga-t.jp',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  build: { format: 'directory' },
});
