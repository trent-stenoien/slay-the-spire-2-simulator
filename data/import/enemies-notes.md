# Act 1 Easy enemies — what the raw wiki export gives us

Source: `data/raw/enemies.txt` and `data/raw/intents.txt` (Cargo export, v0.107.1).
HP columns are **minimums only** (base / Ascension). Move order is **not** in the export,
so none of these can become `data/enemies/*.json` until the per-enemy wiki pages are read.
Intent syntax: `(base;asc L)` = base value, changed value from Ascension L on.

## Single-enemy encounters (fit the v1 single-target engine)

| Enemy | Zone | HP min (base / asc) | Moves |
|---|---|---|---|
| Nibbit (done, code Nb) | Overgrowth | 42 / 44 | Butt 12 (13 A9); Hesitant Slice 6 (7 A9) + 5 Block (6 A8); Hiss +2 Str (3 A9) |
| Fuzzy Wurm Crawler | Overgrowth | 55 / 58 | Acid Goop 4 (6 A9); Inhale +7 Str |
| Shrinker Beetle | Overgrowth | 38 / 40 | Chomp 7 (8 A9); Shrinker applies Shrink; Stomp 13 (14 A9) |
| Seapunk | Underdocks | 44 / 47 | Bubble Burp 7 Block (8 A8) + 1 Str (2 A9); Sea Kick 11 (13 A9); Spinning Kick 2×4 |
| Sludge Spinner | Underdocks | 37 / 41 | Oil Spray 8 (9 A9) + 1 Weak; Rage 6 (7 A9) + 3 Str; Slam 11 (12 A9) |

## Multi-enemy encounters (need multi-target support first)

- Corpse Slugs (Underdocks): 2× Corpse Slug, 25/27 HP, power Ravenous 4 (5 A9). Glomp 8 (9 A9); Goop 2 Frail; Whip Slap 3×2.
- Toadpoles (Underdocks): 2× Toadpole, 21/22 HP. Spike Spit 3×3 (4 A9), removes 2 Thorns; Spiken +2 Thorns; Whirl 7 (8 A9).
- Group of Slimes (Overgrowth): Leaf Slime (S) 11/12 HP (Goop: Slimed into discard; Tackle 3/4), Twig Slime (S) 7/8 HP (Tackle 4/5), and "Slimes (M)" (no rows in the export).

Acts 2–3 zones (Hive, Glory) also have Easy encounters in `data/raw/encounters.txt`.
