#!/usr/bin/env node
// Dev runner: builds index.html, starts the bridge, rebuilds on src/ changes and restarts on server.js / db.js / schema.js / schemas/ / adapters/ / execution/ / plugins/ changes.
//   npm run dev [-- --port 4317]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const serverArgs = process.argv.slice(2);
const stamp = () => new Date().toLocaleTimeString('pt-BR');
const say = msg => console.log(`\x1b[36m[dev ${stamp()}]\x1b[0m ${msg}`);

/* Same output as build.py (index.html only), so Python is not needed during development. */
function build() {
  const read = file => readFileSync(path.join(SRC, file), 'utf8');
  const scripts = ['portraits.js', 'avatars.js', 'conventions.js', 'souls.js', 'vendor/three.min.js', 'city.js', 'app.js'].map(read).join('\n');
  const html = read('shell.html')
    .replace('<!--STYLE-->', () => '<style>\n' + read('styles.css') + '\n</style>')
    .replace('<!--SCRIPTS-->', () => '<script>\n' + scripts + '\n</script>');
  writeFileSync(path.join(ROOT, 'index.html'), html, 'utf8');
  say(`index.html gerado (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
}

let server = null, restarting = false;
function start() {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js'), ...serverArgs], { cwd: ROOT, stdio: 'inherit' });
  server.on('exit', code => {
    server = null;
    if (restarting) { restarting = false; start(); }
    else if (code !== null && code !== 0) say(`bridge saiu com código ${code}. Aguardando alterações para reiniciar...`);
  });
}
function restart() {
  say('bridge alterado, reiniciando (recarregue a página para renovar o token)');
  if (server) { restarting = true; server.kill(); } else start();
}

const debounce = (fn, ms = 150) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const rebuild = debounce(() => {
  try { build(); say('recarregue a página para ver as mudanças'); }
  catch (err) { say(`falha no build: ${err.message}`); }
});

try { build(); } catch (err) { say(`falha no build inicial: ${err.message}`); process.exit(1); }
start();
watch(SRC, (_event, file) => { if (file && /\.(js|css|html)$/.test(file)) rebuild(); });
const restartSoon = debounce(restart, 200);
for (const file of ['server.js', 'db.js', 'schema.js']) watch(path.join(ROOT, file), restartSoon);
watch(path.join(ROOT, 'adapters'), { recursive: true }, restartSoon);
watch(path.join(ROOT, 'execution'), { recursive: true }, restartSoon);
watch(path.join(ROOT, 'plugins'), { recursive: true }, restartSoon);
watch(path.join(ROOT, 'schemas'), restartSoon);
say('observando src/, server.js, db.js, schema.js, schemas/, adapters/, execution/ e plugins/. Ctrl+C para sair.');

const stop = () => { if (server) server.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
