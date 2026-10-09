import { appendFileSync } from 'node:fs';
// top-level await mais lento que o tempo do register: depois do estouro o register() não pode mais ser chamado
await new Promise(r => setTimeout(r, Number(process.env.SQUAD_SLOW_MS) || 900));
export function register() {
  if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'register-called slow-import\n');
}
