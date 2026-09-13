import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { audit } = await server.ssrLoadModule('/scripts/roguelike-audit.ts');
  const result = audit(Number(process.argv[3] ?? 3));
  const output = process.argv[2] ?? 'artifacts/roguelike/balance-audit.json';
  await fs.mkdir('artifacts/roguelike', { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ output, opening: result.opening, runs: Object.fromEntries(Object.entries(result.runs).map(([k, rows]) => [k, rows.map(({wave,health,stage,kills,seconds})=>({wave,health,stage,kills,seconds}))])) }, null, 2));
} finally { await server.close(); }
