// Verify a chunk copied from the wiki export page.
// Usage: node tools/checksum.mjs <file> <start> <count> <expectedSum>
// The file holds every row of one table, one per line (no header lines).
import { readFileSync } from 'node:fs';

const [file, start, count, expected] = process.argv.slice(2);
if (!file || start === undefined || count === undefined || expected === undefined) {
  console.error('Usage: node tools/checksum.mjs <file> <start> <count> <expectedSum>');
  process.exit(2);
}
const lines = readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
const body = lines.slice(Number(start), Number(start) + Number(count)).join('\n');
let s = 0;
for (let i = 0; i < body.length; i++) s = (s + body.charCodeAt(i) * ((i % 31) + 1)) % 1000000007;
const ok = String(s) === String(expected);
console.log(
  `${ok ? 'OK' : 'MISMATCH'} rows ${start}..${Number(start) + Number(count) - 1}: sum=${s} expected=${expected}`,
);
process.exit(ok ? 0 : 1);
