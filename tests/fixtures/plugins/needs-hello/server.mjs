export function register(ctx) {
  const hello = ctx.use('hello');
  ctx.registerRoute('GET', '/greet', () => ({ text: hello.greet('mundo') }));
  ctx.registerRoute('GET', '/not-required', () => { try { ctx.use('route-echo'); return { threw: false }; } catch (e) { return { threw: true }; } });
}
