# blog-astro-notion

A fully automated static blog powered by **Notion** as a headless CMS, built with **Astro 5**, and deployed on **Cloudflare Pages**.

## Features

- 📝 **Notion as CMS** — Write in Notion, publish to the web automatically
- ⚡ **Incremental builds** — Only re-fetches changed pages via Content Layer API
- 🖼️ **Permanent images** — Downloads Notion images at build time (no expired S3 URLs)
- 🔄 **Auto-deploy** — Cloudflare Worker polls Notion every 15 minutes for changes
- 🔒 **Private content** — `/private/*` routes protected by Cloudflare Zero Trust (Email OTP)
- 📊 **Rich blocks** — Tables, LaTeX equations (KaTeX), code highlighting, Mermaid diagrams, callouts, TOC
- 📄 **Pagination** — 20 posts per page with page numbers on all list views

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| CMS        | Notion (Official API)               |
| Framework  | Astro 5 (Static Output)             |
| Hosting    | Cloudflare Pages                    |
| Automation | Cloudflare Workers (Cron + Webhook) |
| Security   | Cloudflare Zero Trust               |

## Quick Start

```bash
# Clone and install
git clone https://github.com/primenumbersam/blog-astro-notion.git
cd blog-astro-notion
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Notion API key, Database ID, and Site URL

# Local development
npm run dev
```

## Environment Variables

| Variable                | Where                                 | Description                                          |
| ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| `NOTION_API_KEY`        | `.env`, CF Pages, CF Workers (secret) | Notion Integration token                             |
| `NOTION_DATABASE_ID`    | `.env`, CF Pages, CF Workers (var)    | Notion database ID                                   |
| `SITE_URL`              | `.env`, CF Pages                      | Production URL (e.g., `https://blog.gitsam.com`)     |
| `CF_API_TOKEN`          | CF Workers (secret)                   | Cloudflare API token with **Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | CF Workers (var)                      | Cloudflare account ID                                |
| `CF_PROJECT_NAME`       | CF Workers (var)                      | Cloudflare Pages project name                        |
| `WEBHOOK_SECRET`        | CF Workers (secret)                   | Secret for webhook URL validation                    |

## Notion Database Setup

Create a Notion database with these properties:

| Property    | Type         | Purpose                                   |
| ----------- | ------------ | ----------------------------------------- |
| Name        | Title        | Page title                                |
| Slug        | Text         | URL path (e.g., `my-first-post`)          |
| Description | Text         | Meta description / OG description         |
| Tags        | Multi Select | Category tags                             |
| IsPrivate   | Checkbox     | `true` → `/private/`, `false` → `/posts/` |
| Status      | Select       | `Draft` / `Published` / `Test`            |
| Publish     | Button       | Triggers immediate deploy via webhook     |

## Deployment

See [SPEC.md](SPEC.md) for the full architecture specification and `.agents/workflows/build-blog-astro-notion.md` for step-by-step setup instructions.

### Manual Deploy Trigger

```bash
curl -X POST "https://blog-deploy-triggers.<subdomain>.workers.dev/?secret=<your-secret>"
```

## Project Structure

```
src/
├── content/config.ts         # Notion content loader
├── pages/
│   ├── [...page].astro       # Public post list (paginated)
│   ├── posts/[slug].astro    # Public post pages
│   ├── private/              # Private content (Zero Trust protected)
│   └── tags/[tag]/           # Tag-filtered lists (paginated)
├── components/notion-blocks/ # Notion block renderers
├── lib/notion/               # API client, loader, image cache
└── layouts/                  # Shared layout + CSS
workers/
└── index.js                  # Cron + Webhook unified worker
```

## License

[MIT](LICENSE.md)
