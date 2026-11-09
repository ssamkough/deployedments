const NAMES: Record<string, string> = {
  next: 'Next.js',
  nextjs: 'Next.js',
  astro: 'Astro',
  vite: 'Vite',
  remix: 'Remix',
  'react-router': 'React Router',
  sveltekit: 'SvelteKit',
  'sveltekit-1': 'SvelteKit',
  'svelte-kit': 'SvelteKit',
  svelte: 'Svelte',
  nuxt: 'Nuxt',
  nuxtjs: 'Nuxt',
  gatsby: 'Gatsby',
  'create-react-app': 'Create React App',
  react: 'React',
  vue: 'Vue',
  vuepress: 'VuePress',
  angular: 'Angular',
  ember: 'Ember',
  solidstart: 'SolidStart',
  'solid-start': 'SolidStart',
  qwik: 'Qwik',
  hugo: 'Hugo',
  jekyll: 'Jekyll',
  eleventy: 'Eleventy',
  docusaurus: 'Docusaurus',
  hexo: 'Hexo',
  gridsome: 'Gridsome',
  hydrogen: 'Hydrogen',
  redwoodjs: 'RedwoodJS',
  blitzjs: 'Blitz.js',
  storybook: 'Storybook',
  tanstack: 'TanStack Start',
  'tanstack-start': 'TanStack Start',
  express: 'Express',
  fastapi: 'FastAPI',
  flask: 'Flask',
  python: 'Python',
  node: 'Node.js',
  '#static': 'Static HTML',
  static: 'Static HTML',
  '#custom': 'Custom',
  '#unknown': 'Other',
};

/** Normalises framework slugs from different providers to one display name. */
export function normalizeFramework(raw?: string | null): string | undefined {
  const slug = raw?.trim().toLowerCase();
  if (!slug || slug === 'unknown' || slug === 'other') return undefined;
  const known = NAMES[slug];
  if (known) return known;
  return slug
    .replace(/^#/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
