# 🎟️ Raffler

> A beautiful, fair raffle picker with weighted random selection. Add contestants, assign tickets, and watch the reel decide.

**100% client-side — your list never leaves your browser.**

[**▶ Live demo**](https://nathanenglert.github.io/raffler/) · [Report a bug](https://github.com/nathanenglert/raffler/issues) · [Request a feature](https://github.com/nathanenglert/raffler/issues)

---

## Features

- ⚖️ **Weighted random draws** — more tickets = better odds, backed by `crypto.getRandomValues` for strong randomness
- 🎰 **Slot-machine reveal** — animated spinning reel that lands on the winner, with a "weighted tape" so the visual frequency matches the actual odds
- 🎉 **Confetti celebration** — because winning deserves it (respects `prefers-reduced-motion`)
- 👥 **Multi-winner draws** — pick N winners, with optional "unique winners" mode (winner removed from pool)
- 💾 **Local persistence** — contestants and history saved to `localStorage`; nothing is uploaded
- 📥 **Bulk import** — paste `Name, tickets` per line, or upload a CSV
- 📤 **CSV export** — back up or share your list
- 📱 **Mobile-first** — responsive layout, fully usable on small screens
- ♿ **Accessible** — keyboard-friendly, ARIA labels, reduced-motion aware
- 🚀 **Zero dependencies, zero build step** — just static HTML, CSS, and JS

## Quick start

You only need a browser. Either open `index.html` directly, or serve the folder:

```bash
# Python (no install required on macOS/Linux)
python3 -m http.server 8000

# or with Node
npx serve .
```

Then open <http://localhost:8000>.

## Usage

1. **Add contestants** with a name and ticket count. Duplicate names (case-insensitive) merge their tickets.
2. **Bulk-import** by pasting `Name, 5` per line, or by uploading a CSV with a `name,tickets` header.
3. **Choose how many winners to pick** and whether each winner is removed from the pool ("Unique winners").
4. **Hit "Pick a winner"** and watch the reel.

Your contestants and recent winners persist across reloads via `localStorage`. Nothing is sent anywhere.

### CSV format

```csv
name,tickets
Alice,5
Bob,1
"Carol, Jr.",2
```

Names with commas should be wrapped in double quotes. Tickets default to `1` if omitted.

## Project layout

```
.
├── index.html              # Markup
├── styles.css              # All styles
├── app.js                  # Raffle logic + animations
├── CLAUDE.md               # Notes for Claude Code contributors
├── .github/workflows/
│   └── pages.yml           # GitHub Pages deploy
└── README.md
```

`app.js` is a single IIFE — see `CLAUDE.md` for an architecture overview.

## Deployment

The repo is pre-configured to deploy to **GitHub Pages** via GitHub Actions:

1. Push to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Pushes to `main` trigger `.github/workflows/pages.yml`, which uploads the repo root as-is.

The site will be served at `https://<your-username>.github.io/<repo-name>/`.

Because it's pure static files, it deploys equally well to Netlify, Vercel, Cloudflare Pages, S3, or any static host.

## Browser support

Modern evergreen browsers — Chrome, Firefox, Safari, Edge. Requires `localStorage` and `crypto.getRandomValues` (falls back to `Math.random` if unavailable).

## Contributing

Issues and PRs are welcome. Since there's no build or test infrastructure, please:

- Keep the **zero-dependency, zero-build** constraint — no npm packages, no transpilers.
- Match the existing code style in `app.js` (single IIFE, no frameworks).
- Test changes manually in at least one mobile and one desktop viewport.
- For UI tweaks, verify `prefers-reduced-motion` still degrades gracefully.

## License

[MIT](LICENSE) © Nathan Englert
