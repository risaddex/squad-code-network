export function register(ctx) {
  ctx.registerRoute('GET', '/x', () => ({}));
  ctx.on('run:beforeSpawn', () => ({}));
}
