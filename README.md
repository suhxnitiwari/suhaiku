# Suhaiku

A small museum of haiku. Every painting is composed from the poem hung inside it, and Claude writes new ones while you watch.
Designed and built by Suhani.

**→ Live at [suhxnitiwari.github.io/suhaiku](https://suhxnitiwari.github.io/suhaiku/)**

## Ownership

© 2026 Suhani Tiwari. **All rights reserved.** The code is public so you can see how I build, not so you can reuse it. See [LICENSE](LICENSE).

## How it's put together

| Path | What it is |
|---|---|
| `src/page.html` | The whole app: layout, styles, the painting composer, the video maker. The same file is published as the Claude artifact. |
| `shim.js` | Lets the page run outside Claude: sends poem requests to `/api/claude` and saves downloads in the browser. |
| `api/claude.js` | Serverless function that calls Claude (`claude-opus-5-5`) with your API key and streams the poem back. |
| `build.mjs` | Wraps `src/page.html` + `shim.js` into `public/index.html`. Vercel runs it on every deploy. |

The API key never reaches the browser. The function also limits prompt size, accepts one image per request, rate-limits each visitor, and only writes poems.

## Deploy to Vercel (free)

1. **Get an API key.** Sign in at [console.anthropic.com](https://console.anthropic.com), add a few dollars of credit under Billing, then create a key under API Keys. Copy it somewhere safe.
2. **Install the Vercel CLI and deploy** (in this folder):
   ```bash
   npm install -g vercel
   vercel
   ```
   It opens a browser to log in, then asks a few questions. The defaults are fine.
3. **Add your key** in the Vercel dashboard: your project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` with your key. Optionally add `ALLOWED_ORIGIN` set to your site's URL (for example `https://suhaiku.vercel.app`) so other websites can't use your backend.
4. **Go live:**
   ```bash
   vercel --prod
   ```

## Updating the design

Edit `src/page.html`, then run `vercel --prod` again. To preview locally with the backend: `npm run dev`.

## Cost

Each poem is one short Claude request at low effort, usually a fraction of a cent. Set a monthly spend limit in the Anthropic Console (Settings → Limits) so a busy day can't surprise you.
