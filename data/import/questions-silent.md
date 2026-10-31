# Silent card import questions

- **Poison (about 14 Silent cards, e.g. Deadly Poison, Noxious Fumes, Outbreak, Haze)**: Poison has no effect object, so should the engine eventually support Poison (tick damage at turn start, Accelerant, Envenom triggers)? Cards are recorded with partial effects and simulated=false.
- **Shivs (Blade Dance, Cloak and Dagger, Hidden Daggers, Storm of Steel, Accuracy, Fan of Knives, etc.)**: Is creating Shiv cards in hand in scope for v1, and does a Shiv count as a card type with Exhaust and cost 0?
- **Sly (Abrasive, Flick Flack, Reflex, Ricochet, Tactician, Untouchable, Snakebite-style cards)**: Sly is not in the simulated keyword list; should cards with Sly (play for free when discarded) stay unsimulated until discard effects exist?
- **Innate (Assassinate, Backstab, Suppress)**: These are otherwise fully expressible but Innate is not a simulated keyword, so they are false; should Innate be added to the engine (start combat in opening hand)?
- **Draw/discard cards (Acrobatics, Backflip, Prepared, Survivor, Dagger Throw, ...)**: Should draw and discard effects be added to the vocabulary? Currently the damage/block parts are recorded and simulated=false.
- **Echoing Slash, Skewer, Malaise (X-cost and conditional scaling)**: Should X-cost, "for each" and "repeat on kill" scaling be added? Recorded as partial/empty.
- **Dexterity / Intangible / Thorns / Retain**: No Dexterity or Intangible effects exist; Dexterity-based cards (Footwork, Anticipate, Wraith Form) are empty and unsimulated.
- **Multiplayer wording (Blade Symphony, Concoct, Fade, Flanking, Sneaky, Nightmare)**: Should multiplayer-only text cards be left permanently unsimulated?
- **Ricochet** (#6): random-target damage recorded as a plain `attack` 3×4 (3×5 upgraded), no `randomTarget` flag in the contract; still false because of Sly.
- **Bouncing Flask**: "Apply 3 Poison to a random enemy 3 times" against one enemy is 9 Poison; should it be recorded as three `applyPoison` 3 effects and simulated, or left until Poison targeting is settled? Left empty and false for now.
