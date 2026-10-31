# STS2 Combat Simulator — working notes for agents

Client-side React + TypeScript app (Vite, Vitest) that auto-plays Slay the Spire 2
combats and runs Monte Carlo comparisons of play strategies. Deployed to GitHub
Pages by `.github/workflows/deploy.yml` on push to `main`.

## Working model

The main session is the orchestrator: it plans, delegates, reviews and merges.
All programming (code, tests, data files) is done by sub-agents on their own branches,
never directly by the orchestrator.

## Layout

- `engine/` — pure TypeScript. No React, no DOM, no imports from `app/`. Must run
  inside Web Workers and Vitest.
- `data/` — hand-entered JSON: `manifest.json`, `cards/` (shared Strike/Defend at the top level; `ironclad/`, `colorless/`, `curses/` subfolders), `enemies/`, `characters/`.
  Source: slaythespire.wiki.gg (CC BY-SA 4.0; keep attribution in `data/LICENSE`).
- `app/` — React UI, workers, charts. May import from `engine/` and `data/`.

## The contract

`engine/types.ts` is the shared contract. Do not change it on a feature branch.
If a task needs a type change, stop and report what you need and why.

## Rules that are easy to get wrong

- Determinism: all randomness goes through a seeded `Rng`. Same config + seed must
  produce an identical event log. Never call `Math.random()` in `engine/`.
- Damage per hit = floor((base + Strength) × modifiers). Vulnerable on the target ×1.5.
  Block absorbs hits in order.
- Turn order: player block resets → energy refills → draw 5 (reshuffle discard into
  draw pile mid-draw if needed) → strategy plays → end of player turn: Ethereal
  cards in hand exhaust, rest of hand discarded, debuffs on BOTH player and enemy
  tick down by 1 → enemy block resets → enemy move → pattern advances.
- Ascension overrides are cumulative (A9 applies A8 then A9). Ascender's Bane is
  added automatically at A5+ via `manifest.ascensionCards`.
- `hpLost` is measured before any healing. Burning Blood is not simulated.
- Turn cap is 100 (`TURN_CAP`). Codes (cards, enemies, characters) are permanent.

## Conventions

- Tests live next to code as `*.test.ts`. Every rule gets a test.
- `npm test`, `npm run typecheck`, and `npm run build` must pass before handing back.
- Work on your own branch; the orchestrator merges.
- Design doc: https://claude.ai/artifact/D79XTt7hTXmws6JnNBGt7h
