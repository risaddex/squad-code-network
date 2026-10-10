// Observa todos os eventos. settings: { partial: true } liga stream_event em run:event (exige run.content); { events: [...] } restringe a lista.
const ALL = ['run:start', 'run:event', 'run:finish', 'profile:usage', 'workspace:saved'];
export function register(ctx) {
  const settings = ctx.settings();
  const log = [];
  for (const event of settings.events || ALL) {
    ctx.on(event, payload => {
      // run:event guarda um resumo (o evento inteiro pode ser grande) e o texto bruto, para provar o que NÃO chegou.
      if (event === 'run:event') log.push({ event, runId: payload.runId, type: payload.type ?? payload.event?.type, subtype: payload.subtype ?? payload.event?.subtype ?? null, keys: Object.keys(payload), raw: JSON.stringify(payload), toolName: payload.toolName ?? null });
      else log.push({ event, keys: Object.keys(payload), payload: JSON.parse(JSON.stringify(payload)), frozen: Object.isFrozen(payload) });
    }, event === 'run:event' && settings.partial ? { partial: true } : undefined);
  }
  ctx.registerRoute('GET', '/log', () => ({ log }));
  ctx.registerRoute('POST', '/reset', () => { log.length = 0; return { ok: true }; });
}
