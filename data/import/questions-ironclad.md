# Ironclad card import questions

- **Sword Boomerang (and Juggernaut, Stampede, Hellraiser)**: "random enemy" targeting has no effect object, so effects are left empty; with the v1 single enemy, should Sword Boomerang be recorded as 3 hits of 3 and simulated?
- **Mangle / Fight Me**: should "enemy loses Strength this turn" and "the enemy gains 1 Strength" get effect objects, since gainStrength only applies to the player?
- **Conditional damage (Spite, Dismantle, Tear Asunder, Bully, Ashen Strike, Perfected Strike, Pacts End, Thrash, Rampage)**: only the base attack is recorded and the cards are unsimulated; is scaling/conditional damage planned for the engine?
- **Thunderclap, Conflagration, Stomp, Breakthrough**: ALL-enemies effects are marked simulated only where fully expressible (Thunderclap, Conflagration); Thunderclap's "apply to ALL enemies" Vulnerable is recorded as a plain applyVulnerable, correct for v1?
- **Draw / HP loss / Exhaust choice (Pommel Strike, Shrug It Off, Hemokinesis, True Grit, Cinder, etc.)**: all left unsimulated; is a draw/lose-HP effect planned?
