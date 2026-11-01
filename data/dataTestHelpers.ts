/** Shared setup for the data test files (not a test file itself). */
import { gameData } from './index';
import { validateGameData } from './validate';

export const VERSION = 'v0.107.1';

/** Deep copy of the real data, for breaking in validator tests. */
export function fixture(): any {
  return structuredClone(gameData);
}

export function errorsOf(raw: unknown): string[] {
  const result = validateGameData(raw);
  return result.ok ? [] : result.errors;
}
