# codevalanche.com

The source of [codevalanche.com](https://codevalanche.com), the website of Codevalanche.

Codevalanche is a Windows desktop app that runs Claude Code, Codex and local models in one place. The app itself is closed source and is not in this repository. Its installers and update feed are published in [codevalanche-desktop-releases](https://github.com/Radovar-com/codevalanche-desktop-releases).

## What is in this repository

- `src/` – the static website: pages, styles, translations and the account pages.
- `scripts/` – the build and the tests.
- `supabase/` – the database schema and functions behind Codevalanche accounts.
- `workers/`, `cloudflare/` – the edge configuration that serves the site.

## Documentation

The docs at `/docs/` are written in `content/docs/` (one file per section, built from small helpers in `content/docs/kit.mjs`). The build renders every page with its navigation, search index, structured data and sitemap entry (`scripts/docs-render.mjs`). The `/docs/` home is a translated page generated from the same navigation: after changing `content/docs/`, run `node scripts/docs-hub.mjs`, then add any new hub strings to the locale catalogs. The detailed pages are English for now.

## Build and test

Requires Node.js 24.

```
npm ci
npm run build
npm test
```

Every push to `main` is tested and published to GitHub Pages by `.github/workflows/deploy-pages.yml`.

## Contact

- Security reports: [security@radovar.com](mailto:security@radovar.com)
- Everything else: [info@radovar.com](mailto:info@radovar.com)
- Updates on X: [@Codevalanche](https://x.com/Codevalanche)

Codevalanche is made by [Radovar](https://radovar.com).
