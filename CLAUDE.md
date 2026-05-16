# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Raffler is a zero-dependency, zero-build static web app for weighted random raffle draws. All three source files (`index.html`, `styles.css`, `app.js`) sit at the repo root. No package manager, no bundler, no test framework. State lives entirely in the browser's `localStorage`.

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

There is no lint or test command. The only CI is `.github/workflows/pages.yml`, which uploads the repo root as-is and deploys to GitHub Pages on push to `main`.

## Architecture

`app.js` is a single IIFE structured as: storage → helpers → render → mutations → bulk/CSV → draw → reel animation → confetti → event wiring → seed/initial render. There is no module system or framework — DOM nodes are cached in an `els` object at the top, and every mutation calls `render()` to redraw the list, stats, history, and draw-button state.

Two `localStorage` keys hold all persistent state:
- `raffler:contestants:v1` — `{id, name, tickets}[]`
- `raffler:history:v1` — `{name, at, pick}[]`, newest-first, capped at `MAX_HISTORY` (25)

A one-time `raffler:seeded` flag seeds four sample contestants on first visit so the app isn't empty.

### Weighted draw

`weightedPick(pool)` is the single source of truth for fairness: sums all tickets, draws a uniform float from `crypto.getRandomValues` (falls back to `Math.random`), and walks the pool subtracting tickets. The reel animation in `buildSpinSequence` constructs a "weighted tape" by repeating each name once per ticket so the visual frequency during the spin matches the actual odds — keep this invariant if you change the pick logic.

### Draw modes

`draw()` snapshots the contestants into a local `pool`, then runs the draw loop:
- **Unique winners** (checkbox on by default): remove the winner from both `pool` and `contestants` after each pick. Max draws = `contestants.length`.
- **Non-unique**: decrement the winner's tickets by 1 in both lists; remove when tickets hit 0. Max draws = `totalTickets()`.

Both modes mutate `contestants` and persist mid-draw, so a closed tab mid-sequence leaves the pool in the correct partial state.

### Reel animation

`spinTo()` sets the track to a tall sequence ending with the winner near the bottom (with 3–5 trailing names, so the wheel doesn't look like it "ran out"), then transforms with a cubic-bezier ease-out plus a small overshoot/spring-back. Item height is breakpoint-dependent (70px under 460px wide, otherwise 80px) — it's read from JS, so changing it in CSS alone will desync the landing position.

### Accessibility / motion

`fireConfetti()` early-exits on `prefers-reduced-motion: reduce`. The reel transition itself does not honor reduced-motion; if you add motion gates, do it here.

## Conventions

- Names are sanitized to ≤60 chars and deduplicated case-insensitively (`addContestant` merges tickets into the existing entry).
- Tickets are clamped to `[1, 9999]`.
- `escapeHtml` is used anywhere user-provided text is interpolated via `innerHTML` (history list, reset message). Prefer `textContent` for new code.
- History `pick` numbers are monotonic across all draws ever — they're derived from `max(history.pick) + 1`, not the current session.
