import { appendFileSync } from 'node:fs';
if (process.env.SQUAD_PLUGIN_MARKER) appendFileSync(process.env.SQUAD_PLUGIN_MARKER, 'import cycle\n');
export function register() {}
