import { defineConfig } from 'astro/config';

// Netlify exposes the production URL as `URL` during builds.
export default defineConfig({
  site: process.env.URL || undefined,
  output: 'static',
  devToolbar: { enabled: false },
});
