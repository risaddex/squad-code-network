import { appendFileSync } from 'node:fs';

export function register(ctx) {
  if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'register code-and-content\n');
  if (process.env.SQUAD_CC_FAIL) throw new Error('falhou de propósito');
  ctx.registerRoute('GET', '/ping', () => ({ pong: true }));
}
