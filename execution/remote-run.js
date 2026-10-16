'use strict';
/** Remote transport lifecycle. No network request is itself proof of a terminal task. */
function attachRemote(run, open, { pushEvent, finish, flush, recordCancel = () => {} }) {
  let handle = null;
  const uncertain = () => {
    if (run.status === 'running') pushEvent(run, { type: 'bridge', subtype: 'remote_uncertain', message: 'Estado remoto ainda não confirmado. A execução permanece em acompanhamento.' });
  };
  run.cancelRemote = async () => {
    if (run.status !== 'running') return;
    recordCancel(run);
    run.cancelRequested = true;
    pushEvent(run, { type: 'bridge', subtype: 'cancel_requested', message: 'Cancelamento solicitado; aguardando confirmação remota.' });
    flush(run);
    if (handle) { try { await handle.cancel(); } catch { uncertain(); } }
  };
  run.closeRemote = () => { run.remoteClosed = true; clearTimeout(run.timer); try { handle?.close?.(); } catch {} };
  const emit = event => {
    if (run.status !== 'running' || run.remoteClosed) return;
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || event.type === 'exit' || event.type === 'result') return;
    // Plugin events are copied so later mutation cannot change the history or another observer.
    const copy = JSON.parse(JSON.stringify(event));
    if (JSON.stringify(copy).length > 262144) return;
    pushEvent(run, copy);
    if (copy.type === 'remote_task') flush(run);
  };
  Promise.resolve().then(() => { if (run.remoteClosed) return null; return open(emit); }).then(value => {
    if (run.remoteClosed && !value) return;
    if (!value || !value.done || typeof value.done.then !== 'function' || typeof value.cancel !== 'function' || typeof value.close !== 'function') throw new Error('Invalid remote handle');
    handle = value;
    // Subscribe immediately, including while cancel is waiting or the host is closing.
    Promise.resolve(handle.done).then(terminal => {
      if (run.remoteClosed || run.status !== 'running') return;
      if (!terminal || !['done', 'error', 'cancelled'].includes(terminal.status)) { uncertain(); return; }
      // Only the remote adapter, after observing a terminal task, may resolve done.
      finish(run, terminal);
    }).catch(uncertain);
    if (run.remoteClosed) { handle.close(); return; }
    if (run.cancelRequested) Promise.resolve().then(() => handle.cancel()).catch(uncertain);
  }).catch(uncertain);
}
module.exports = { attachRemote };
