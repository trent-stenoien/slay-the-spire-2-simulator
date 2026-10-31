# Ironclad card import questions

- ~~**Sword Boomerang (and Juggernaut, Stampede, Hellraiser)**~~ Resolved (#6): a random target is the one enemy in a single-enemy fight. Sword Boomerang is recorded as a plain `attack` 3×3 (3×4 upgraded; the contract has no `randomTarget` flag) and simulated. Juggernaut, Stampede and Hellraiser are powers and stay false.
- **Mangle / Fight Me**: should "enemy loses Strength this turn" and "the enemy gains 1 Strength" get effect objects, since gainStrength only applies to the player?
- **Conditional damage (Spite, Dismantle, Tear Asunder, Bully, Ashen Strike, Perfected Strike, Pacts End, Thrash, Rampage)**: only the base attack is recorded and the cards are unsimulated; is scaling/conditional damage planned for the engine?
- ~~**Thunderclap, Conflagration, Stomp, Breakthrough**~~ Resolved: ALL-enemies effects are marked simulated only where fully expressible (Thunderclap, Conflagration); fights are single-enemy, so Thunderclap's Vulnerable is a plain applyVulnerable.
- **Draw / HP loss / Exhaust choice (Pommel Strike, Shrug It Off, Hemokinesis, True Grit, Cinder, etc.)**: all left unsimulated; is a draw/lose-HP effect planned?
