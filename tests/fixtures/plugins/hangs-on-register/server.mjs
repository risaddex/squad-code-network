import { appendFileSync } from 'node:fs';
const mark = line => { if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, line + '\n'); };
export function register(ctx) {
  ctx.registerRoute('GET', '/x', () => ({}));
  ctx.onDispose(() => mark('dispose hangs-on-register'));
  // depois do tempo limite o ctx já está congelado: o registro tardio tem de ser recusado
  setTimeout(() => { try { ctx.registerRoute('GET', '/tarde', () => ({})); mark('late-registered hangs'); } catch { mark('late-refused hangs'); } }, 700);
  return new Promise(() => {});
}
