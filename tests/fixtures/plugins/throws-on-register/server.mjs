import { appendFileSync } from 'node:fs';
const mark = line => { if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, line + '\n'); };
export function register(ctx) {
  ctx.registerRoute('GET', '/half', () => ({ half: true }));
  ctx.onDispose(() => mark('dispose throws-on-register'));
  throw new Error('falhou de propósito');
}
