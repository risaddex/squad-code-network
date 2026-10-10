import { appendFileSync } from 'node:fs';
export function register(ctx) {
  if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'register bad-settings\n');
  ctx.registerRoute('GET', '/x', () => ({}));
}
