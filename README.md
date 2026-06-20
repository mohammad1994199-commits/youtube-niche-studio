# Original Content Studio

A small website with two parts:

1. **Discovery** — searches YouTube for a niche keyword and pulls real metadata
   (titles, channels, view counts) for the top videos.
2. **Pipeline** — five agents that read the *patterns* in that data (never the
   specific titles/characters) and generate an original concept, script,
   visual direction, and an originality/safety QA check.

Nothing in this pipeline is designed to copy a specific channel, character, or
title — the Trend Scout agent is explicitly instructed to extract structural
patterns only, and the QA agent flags anything that resembles existing IP.

## 1. Get your API keys

**Anthropic API key**
- console.anthropic.com → API Keys → Create Key

**YouTube Data API v3 key**
- console.cloud.google.com → create/select a project
- "APIs & Services" → "Library" → enable **YouTube Data API v3**
- "APIs & Services" → "Credentials" → "Create Credentials" → API key
- Note: the free quota is 10,000 units/day. Each search costs ~100 units, so
  you get roughly 100 niche searches/day before you'd need to request more
  quota or add billing.

## 2. Run it locally

```bash
cd youtube-niche-studio
npm install
cp .env.example .env
# edit .env and paste in your two keys
npm start
```

Open http://localhost:3000

## 3. Deploy it for real

This is a plain Node/Express app, so it runs on any Node host. Two easy options:

**Render.com**
1. Push this folder to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add `ANTHROPIC_API_KEY` and `YOUTUBE_API_KEY` under Environment.
5. Deploy — Render gives you a public URL.

**Railway.app**
1. Push to GitHub, then Railway → New Project → Deploy from repo.
2. Add the same two environment variables.
3. Railway auto-detects `npm start`.

Either way: never commit your `.env` file or put the keys in any
client-side code — they're only ever read server-side in `server.js`.

## Notes on cost

- Each "Run pipeline" click makes 5 Claude API calls (charged per token, see
  anthropic.com/pricing).
- Each "Search YouTube" click uses YouTube API quota (~100 units per search).
- For higher traffic, consider caching discovery results per niche keyword
  for a few hours instead of hitting the YouTube API on every click.
