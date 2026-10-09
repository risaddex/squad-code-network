// settings: { mode: 'throw' | 'flaky' (falha em chamadas alternadas) | 'hang' | 'gate' | 'ok', events: [...] }. 'gate' espera globalThis.__observerGate (testes no mesmo processo).
export function register(ctx) {
  const settings = ctx.settings();
  const mode = settings.mode || 'throw';
  const state = (globalThis.__observer ||= { calls: 0, seen: [] });
  ctx.registerRoute('GET', '/calls', () => ({ calls: state.calls }));
  for (const event of settings.events || ['run:event']) {
    ctx.on(event, async payload => {
      state.calls++;
      state.seen.push(payload);
      if (mode === 'throw' || (mode === 'flaky' && state.calls % 2 === 1)) throw new Error('observador quebrado');
      if (mode === 'hang') await new Promise(() => {});
      if (mode === 'gate') await globalThis.__observerGate;
    }, settings.partial ? { partial: true } : undefined);
  }
}
