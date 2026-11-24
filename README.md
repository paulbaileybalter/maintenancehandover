# Balter Brewing · Daily Maintenance Handover

A password-protected Cloudflare **Worker** (not Pages) for the daily maintenance shift handover. Several people can have it open on different devices at the same time. Everything is saved to Cloudflare KV, and every open screen picks up changes within about 15 seconds. The **Email version** button builds an email-safe copy that looks the same as the site, ready to paste into Outlook, Gmail or Apple Mail.

Send it after the afternoon plant checks (Brisbane time).

## What's in it

| Section | What goes in |
|---|---|
| Critical services | One row per plant check: a tick box for done, a RAG status (Red / Amber / Green) and a comments box, edited in place and saved as you go |
| Breakdowns | What went down, downtime, root cause, action taken |
| Outstanding issues | Open breakdowns, temp fixes, equipment at risk |
| Planned maintenance | Key jobs for today, tomorrow and the next 48 h, typed in on the site |
| Contractors | Who's on site, what they're doing, who's hosting them |
| Safety | Incidents, near misses, hazards, concerns |
| Wins | Good repairs, proactive work, improvements |

Every entry has an owner and a coloured status pill. The top of the sheet has Prepared by, Plant checks time, a one-line headline and a summary strip.

Handy buttons:
- **Start today's plant checks** (in an empty Critical services section) adds the standard list of plant checks (steam, glycol, air, CO₂, water, effluent, power). **＋ Add** adds another service and ✕ removes one. Picking a RAG colour ticks the box too.
- **Carry over open items** brings forward anything still open from the last handover: unfixed breakdowns (as outstanding issues), outstanding issues, unfinished work orders, upcoming planned jobs, undelivered parts, open hazards and the plant checks list (unticked, with no RAG). Running it twice won't duplicate anything.
- **‹ / ›** and the date picker move between days. Each day is kept.

## Fiix
This version doesn't import from Fiix; everything is typed in on the site. The fuller version (Work orders, Parts, and a Fiix export import that filled Breakdowns, Outstanding issues, Work orders, Planned maintenance and Parts, Balter rows only) is kept in `snapshots/handover-v1-full-2026-11-25.zip` in the project files.

## Project layout

```
src/index.js          Worker: login, session cookie, KV API, serves the site
public/               The site (only served after login, except the login page, fonts and logo)
  index.html, app.js, styles.css
  lib/sections.js     Sections, fields, status colours (shared by site and Worker)
  lib/email.js        Builds the email-safe HTML
  login.html, login.js
  logo.svg, favicon.svg, email-logo.png, fonts/ (Lexend)
wrangler.jsonc        Worker config: static assets + KV binding
```

To change a section, its fields or the status options, edit `public/lib/sections.js`. The site, the email and the server-side checks all read from it.

## Setup (one time)

### 1. Put the code on GitHub
Create a new **private** repository (for example `balter-maintenance-handover`) and push this folder to it. `.gitignore` already keeps `node_modules`, `.wrangler` and `.dev.vars` out.

### 2. KV is created for you
Nothing to do here. `wrangler.jsonc` lists the `HANDOVER_KV` binding with no ID, so the first deploy creates the KV namespace automatically (Wrangler's automatic provisioning) and binds it to the Worker. Later deploys reuse the same namespace, so your data stays put.

After the first deploy you'll see it under **Storage & Databases → Workers KV**.

If you'd rather manage it yourself, create a namespace there and add `"id": "<namespace id>"` under the binding in `wrangler.jsonc`.

### 3. Connect the repo to a Worker
Dashboard → **Workers & Pages → Create → Import a repository** → pick the GitHub repo.
- Project name: `balter-maintenance-handover` (must match `name` in `wrangler.jsonc`)
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

Every push to the main branch now deploys automatically. The first deploy also creates the KV namespace.

### 4. Add the password secret
Worker → **Settings → Variables and Secrets → Add** → type **Secret**:
- `HANDOVER_PASSWORD` = the password the team will use (use something long)

Optional second secret:
- `SESSION_SECRET` = a long random string. If it's set, changing the password does **not** sign people out. If it's not set, changing the password signs everyone out, which is usually what you want.

Until `HANDOVER_PASSWORD` exists the site shows a "Setup needed" message instead of opening.

### 5. Open it
Go to `https://balter-maintenance-handover.<your-subdomain>.workers.dev`, or add a custom domain under Worker → **Settings → Domains & Routes**.

## Security notes
- The password is a Cloudflare secret, never in the code or the repo.
- After sign-in the browser gets a signed, HttpOnly, Secure, SameSite=Strict cookie that lasts 14 days. **Sign out** clears it.
- 10 wrong passwords from one IP locks that IP out for 15 minutes.
- Everything except the login page, fonts and logo needs a valid session, including the page code and the API.
- Pages send `noindex`, a strict Content Security Policy and no-framing headers.
- For tighter control later, you can put Cloudflare Access (Zero Trust) in front of the Worker so people sign in with their work email.

## Syncing between devices
- Each change (one entry, or the header fields) is sent on its own, so two people editing different entries at the same moment don't overwrite each other.
- Open screens check for changes every 15 seconds and when the tab is brought back up. An entry you're halfway through editing isn't replaced under you.
- Cloudflare KV can take up to 60 seconds to show a change in a *different* region. Devices on site in Brisbane normally see changes straight away.
- If two people save the **same** entry within a second or two, the last save wins.

## The email
**Email version → Copy email**, then paste into a new message. **Copy** next to the subject copies the subject line. **Download .html** saves a file if copy is blocked.

- Built from tables with inline styles so Outlook, Gmail and Apple Mail keep the layout.
- The logo loads from `/email-logo.png` on your site (public on purpose), so some mail apps ask you to "show images" the first time.
- Lexend shows where the font is installed; elsewhere it falls back to Segoe UI or Arial.
- Emoji section icons show in colour in most modern mail apps.

## Run it locally (optional)
```
npm install
echo "HANDOVER_PASSWORD=test" > .dev.vars
npm run dev
```
Then open http://localhost:8787. Local mode uses a local copy of KV, not the real one.

## Deploy with GitHub Actions instead (optional)
If you'd rather deploy from GitHub Actions than Cloudflare's own Git integration (step 3), add a Cloudflare API token (template "Edit Cloudflare Workers") and your account ID as repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then add `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```
Use one method or the other, not both.
