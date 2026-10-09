# Plugins não alteram o núcleo: o núcleo oferece pontos de extensão

Para manter o fork perto do upstream e permitir integrações (novos motores, políticas, observabilidade) sem editar o bridge,
decidimos que extensões com código entram como **Plugins**: pastas com `squad-plugin.json` e um `register(ctx)`, carregadas pelo
bridge, que só podem usar o que o `ctx` oferece (rotas sob `/api/plugins/<id>/`, eventos de execução, `run:beforeSpawn`,
`registerAdapter`). Os Adapters embutidos (`claude`, `codex`) passam a viver num registro (`adapters/`) que o `server.js` consulta,
e um Plugin pode registrar outros. Sem dependências externas: CommonJS no bridge, `import()` dinâmico para o código do plugin,
validação com o `schema.js` do projeto.

## Considered Options

- **Só plugins de conteúdo**: seguro, mas cada novo motor ou política continuaria exigindo mudança no núcleo.
- **Plugins em processo separado (worker/subprocesso com RPC)**: isolamento real, mas um protocolo e um ciclo de vida a mais para
  manter, e latência no caminho quente dos eventos.
- **Monkey-patching / hooks livres**: flexível, mas acopla plugins aos internos e torna cada rebase do upstream arriscado.

## Consequences

- Plugins rodam **no mesmo processo, com as permissões da pessoa**: não é sandbox. `capabilities` pedidas no manifesto e `grants`
  na configuração são consentimento auditável, não contenção.
- Plugins com código só são ativados pela configuração **local** (`squad.local.json`); o `squad.config.json` versionado não pode
  fazer o bridge executar código de ninguém.
- O `ctx` é um contrato público com `apiVersion`; só cresce de forma aditiva.
- Com zero plugins, o comportamento e as respostas do bridge são os mesmos de antes.
