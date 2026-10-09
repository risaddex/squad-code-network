import { appendFileSync } from 'node:fs';
// Efeito colateral no import: o teste prova que o módulo nunca foi importado.
if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'import not-enabled\n');
export function register(ctx) { ctx.registerRoute('GET', '/x', () => ({})); }
