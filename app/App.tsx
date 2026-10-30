import manifest from '../data/manifest.json';

// Placeholder shell. The UI track replaces this.
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>STS2 Combat Simulator</h1>
      <p>Game version {manifest.gameVersion}. Under construction.</p>
      <p>Note: Burning Blood's 6 HP heal is not simulated.</p>
    </main>
  );
}
