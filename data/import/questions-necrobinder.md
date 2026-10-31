# Necrobinder card import questions

- **Osty / Summon (about 25 cards: Afterlife, Bodyguard, Poke, Snap, Unleash, Sacrifice, Spur, ...)**: Should Osty (Necrobinder's companion with its own HP, attacks and Block) and Summon be modeled? Until then these cards have no effect object for those parts and are unsimulated.
- **Doom (about 15 cards: Scourge, Deathbringer, End of Days, Blight Strike, Times Up, ...)**: Should Doom (end-of-turn kill threshold on the enemy) be modeled? Does Doom stack with Block/HP, and does "kill if Doom >= HP" apply at end of enemy turn?
- **Souls (Reave, Grave Warden, Severance, Capture Spirit, ...)**: Should Soul token cards (and their generated copies in draw/hand/discard) be modeled?
- **Ethereal-played tracking (Banshee's Cry, Pull From Below, Spirit of Ash, Veilpiercer)**: Should the engine track "Ethereal cards played this combat" for cost reduction and scaling damage?
- **Retain (Reap, Sow, Eradicate, Misery, Sacrifice, ...)**: Retain is recorded only; should the engine simulate it so Retain cards can be marked simulated?
- **X-cost (Dirge, Eradicate)**: Is X-cost scaling in scope for the engine, and how should X Souls/hits resolve?
- **"This turn" Strength loss (Enfeebling Touch, Shared Fate)**: Should temporary enemy Strength reduction be added as an effect type?
- **Scaling/conditional damage (Death March, Soul Storm, The Scythe, Squeeze, Protector, Rattle)**: Only the printed base damage was recorded; confirm these stay unsimulated until bonus conditions are modeled.
- **Hang, Sleight of Flesh, Debilitate, Misery**: Debuff-interaction cards (Hang doubling, debuff-triggered damage, doubled Vulnerable/Weak, copying debuffs) need new mechanics; deferred.
- **Energy gain/loss and Replay (Delay, Invoke, Borrowed Time, Wisp, Neurosurge, Transfigure)**: Should energy gain and extra cost effects be modeled?
- **Multiplayer wording (Legion of Bone, Glimpse Beyond)**: Confirm multiplayer-only or ally-dependent cards stay unsimulated in single-player.
