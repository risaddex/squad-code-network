# Eventos de todos os Adapters normalizados no formato stream-json do Claude

O app (`src/app.js`) e o histórico de execuções consomem o stream-json do Claude Code em vários pontos (sala da operação, chats, subagentes, replay). Ao adicionar o Adapter `codex`, decidimos que o bridge traduz os eventos do Codex para esse mesmo formato (mensagens `assistant` com `text`/`tool_use`, `user` com `tool_result`, `result` final com uso), em vez de criar um formato neutro novo ou ensinar o cliente a ler os dois.

## Considered Options

- **Formato neutro próprio**: mais limpo, mas exigia reescrever todos os consumidores do app e quebrava o replay dos runs já gravados.
- **Cliente entende os dois**: mais rápido, mas espalharia a lógica de cada motor pelo `app.js`.

## Consequences

O formato do Claude vira o contrato interno. Recursos que o Codex não tem (subagentes, `stream_event` com deltas, custo em USD) simplesmente não aparecem nos eventos traduzidos, e o cliente precisa tolerar a ausência deles.
