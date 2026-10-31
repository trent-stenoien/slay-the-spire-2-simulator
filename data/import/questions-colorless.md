# Colorless card import questions

- ~~**Rip and Tear / Volley**~~ Resolved (#6): a random target is the one enemy in a single-enemy fight, recorded as a plain `attack` (the contract has no `randomTarget` flag). Rip and Tear is simulated; Volley stays false because it is X-cost.
- **Co-op cards (Believe in You, Coordinate, Lift, Rally, Mimic, Gang Up, Tag Team, Knockdown, Huddle Up, Beacon of Hope)**: multiplayer-only mechanics have no effect object; confirm they should stay unsimulated (Rally's Block recorded as own Block only).
- **Innate / Retain cards (Dramatic Entrance, Sovereign Blade, Mad Science variants, etc.)**: Innate and Retain are outside the simulated keyword set, so these are false even when effects are fully expressible; confirm.
- **Shockwave**: "Apply N Weak and Vulnerable to ALL enemies" recorded as applyWeak plus applyVulnerable and marked simulated; confirm.
- **Exterminate**: "3 damage to ALL enemies 4 times" recorded as attack hits 4 with allEnemies; confirm.
- **Clash / Impatience / Restlessness / Stack (conditional or pile-count text)**: conditions have no effect object; Clash's damage recorded but marked false.
- **Upgrade-text oddities**: Stack upgrade ("+3"), The Ball (damage growth 10 -> 15) and Enlightenment (turn -> combat) are not representable; left unsimulated.
