// POST /mode { block, appendSystem, delayMs, gate, hang, throw, getterThrows, mutate, onlyCalls }; GET /seen devolve os payloads recebidos;
// POST /release libera quem está no portão (mode.gate); GET /released conta quantos handlers saíram do portão.
export function register(ctx) {
  const mode = { ...(ctx.settings() || {}) };
  const seen = [];
  const gates = [];
  let released = 0;
  ctx.registerRoute('POST', '/mode', async (req, res, { body }) => { for (const k of Object.keys(mode)) delete mode[k]; Object.assign(mode, await body()); return { ok: true, mode }; });
  ctx.registerRoute('GET', '/seen', () => ({ seen }));
  ctx.registerRoute('POST', '/release', () => { const n = gates.length; for (const open of gates.splice(0)) open(); return { released: n }; });
  ctx.registerRoute('GET', '/released', () => ({ released }));
  ctx.on('run:beforeSpawn', async ev => {
    seen.push(JSON.parse(JSON.stringify(ev)));
    if (mode.mutate) {
      // o payload é uma cópia congelada: nada disto pode chegar à execução (nem ao próximo plugin)
      try { ev.tools?.push('Bash'); } catch {}
      try { ev.profile.adapter = 'x'; } catch {}
      try { ev.agentSlugs.push('x'); } catch {}
    }
    if (mode.onlyCalls && !ev.isCall) return undefined;
    if (mode.gate) { await new Promise(open => gates.push(open)); released++; }
    if (mode.delayMs) await new Promise(r => setTimeout(r, mode.delayMs));
    if (mode.hang) await new Promise(() => {});
    if (mode.throw) throw new Error('politica quebrada');
    if (mode.getterThrows) return { get block() { throw new Error('getter quebrado'); } };
    if (mode.block) return { block: mode.block };
    if (mode.appendSystem) return { appendSystem: mode.appendSystem };
    return undefined;
  });
}
