# Deployedments

A static gallery of every deployment I have live across cloud providers (Netlify and Vercel so far).

At **build time** it queries each provider's API, takes a screenshot of every live site, and bakes it all into
a static Astro site:

- `/`: responsive grid with search, filters (provider, framework, service, Git/custom-domain/services toggles) and
  sorts (name, created, updated, last deployed, provider, framework, number of services). Click a card for a
  dialog with metadata, services/integrations, the connected GitHub repo and dashboard links. Filter/sort state
  and the open dialog are kept in the URL, so views are shareable (`/?provider=vercel#d=vercel%3Aprj_123`).
- `/stats/`: totals, Netlify/Vercel split, frameworks, services, created-per-year, teams, languages and a
  "candidates to retire" list.

## Run it

```sh
npm install
cp .env.example .env     # add NETLIFY_AUTH_TOKEN and/or VERCEL_TOKEN
npm run dev              # collects data, then starts Astro
npm run build            # collects data, then builds ./dist
npm test                 # unit tests for mappers, detection and stats
```

With no tokens, the build uses clearly-labelled **sample data** (and refuses to do so on Netlify's build
servers, where a missing token fails the build instead of publishing fake data).

## How data is collected (`scripts/collect.ts`)

| Step | Source |
| --- | --- |
| Sites / projects | Netlify `GET /sites`, Vercel `GET /v9/projects` (every team the token can see). Only *live* ones are kept. |
| Services: platform | Netlify functions, edge functions, scheduled functions, forms, DB, build plugins. Vercel Marketplace integrations, storage stores, Cron, Analytics, Speed Insights. |
| Services: env vars | Environment variable **names** only (e.g. `INNGEST_EVENT_KEY` ⇒ Inngest). Values are never read. |
| Services: dependencies | The repo's `package.json` via the GitHub API (e.g. `@netlify/blobs` ⇒ Netlify Blobs). Works the same for both providers. |
| Repo details | GitHub API: description, language, visibility. |
| Screenshots | [Microlink](https://microlink.io), falling back to Netlify's own preview. Stored as 800×500 WebP in `public/screenshots/`. |

Everything beyond the site list is best-effort: a 403 on env vars, GitHub rate limits, or a failed screenshot
adds a warning and the card simply shows less. A failure to list sites at all fails the build, so a good
deploy is never replaced by a half-empty one.

Screenshots are cached: an existing image is reused unless the site was deployed since, or it is over 14 days
old. On Netlify the cache persists between builds via `netlify-plugin-cache`. The free Microlink tier allows
roughly 50 screenshots a day, so a first build with more sites than that finishes over a couple of builds
(or set `MICROLINK_API_KEY`).

## Deploying to Netlify

`netlify.toml` is already configured. In the Netlify site's **Environment variables** (mark them secret), set:

| Variable | Needed | Notes |
| --- | --- | --- |
| `NETLIFY_AUTH_TOKEN` | for Netlify sites | Personal access token |
| `VERCEL_TOKEN` | for Vercel projects | Token must be scoped to every team you want listed |
| `GITHUB_TOKEN` | recommended | Read-only; without it GitHub allows only 60 requests/hour and private repos can't be inspected |
| `MICROLINK_API_KEY` | optional | Lifts the screenshot limit |

This site lists itself: once it is deployed to Netlify it is returned by the API like any other site, and the
build also adds it from Netlify's build environment (`SITE_ID`, `URL`) if the token can't see it.

Because data is gathered at build time, **trigger a rebuild to refresh** (for example a scheduled build hook
or a Vercel/Netlify deploy hook called from a cron).

> ⚠️ The published site lists the names, URLs and repos of everything you have deployed, including private
> repos. It sends `X-Robots-Tag: noindex`, but consider putting it behind Netlify password protection / SSO.

## Adding another provider

Add `src/lib/providers/<name>.ts` exporting a `collect<Name>(token, ctx): Promise<Deployment[]>` (keep the
mapping a pure function so it's testable), register it in `scripts/collect.ts`, and add its label to
`src/lib/provider-meta.ts` plus the `ProviderId` union in `src/lib/types.ts`.

## Accessibility notes

Skip link and landmarks; one `h1` per page; all controls labelled; native `<dialog>` (focus trap, Esc, focus
returns to the card); results count in a polite live region; the whole card is a real button with a separate
"Visit" link; charts are tables with decorative bars; colour contrast ≥ 4.5:1 in light and dark; respects
`prefers-color-scheme` and `prefers-reduced-motion`; 44px minimum touch targets.
