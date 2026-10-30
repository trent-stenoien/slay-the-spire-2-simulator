# Defect card import questions

- **Orbs (~45 Defect cards)**: Channel/Evoke/Orb slots/Focus/"for each Channeled Orb" have no effect object; cards using them are partial and unsimulated. Is that the intended handling until Orbs are modelled?
- **Created cards (Adaptive Strike, Boost Away, Fight Through, Overclock, Gunk Up, Turbo, Compact)**: Adding Dazed/Wounds/Burn/Slimed/Void/copies to the discard pile is not expressible; confirm these stay unsimulated.
- **Multiplayer wording (Energy Surge, Ignition, Imitation Learning, One For All)**: "ALL players"/"another player" text; should these be flagged multiplayerOnly or ignored for single-player?
- **Claw / Genetic Algorithm**: Permanent per-card scaling is not expressible; effects record only the base values (Genetic Algorithm Block 1), so cards stay unsimulated.
- **Go for the Eyes**: Conditional Weak (enemy intends to attack) is skipped, only the damage is recorded; confirm.
- **Innate (Boot Sequence, Machine Learning)**: Innate is not in the simulated keyword list, so Boot Sequence stays unsimulated even though its text is fully captured; should Innate be simulated?
