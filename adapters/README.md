# adapters/

Motores que executam os agentes. Toda execução passa por um **Perfil** (linha em `profiles` no `squad.db`: executável, pasta da
conta, modelo e esforço padrão, teto de execuções, Perfil reserva), e cada Perfil é uma instância de um **Adapter**. O
`server.js` nunca cita um motor pelo nome: pergunta ao registro deste diretório tudo o que depende dele (executável, modelos e
níveis, argv, tradução de eventos, janelas de uso, `settings.json`).

| Arquivo | O que é |
|---|---|
| `index.js` | `createRegistry(host)`, `validateAdapter(impl)` e `BUILTIN` (`['claude', 'codex']`) |
| `claude.js` | Claude Code: `claude -p --output-format stream-json` (os eventos já estão no formato do app) |
| `codex.js` | Codex: `codex exec --json`, com tradutor dos eventos para o stream-json do Claude e Chamados pelo MCP do bridge (`/mcp`) |

Decisões e contrato: [`docs/plans/perfis-adapters.md`](../docs/plans/perfis-adapters.md), ADRs em [`docs/adr/`](../docs/adr/)
(0001: formato dos eventos; 0004: plugins não alteram o núcleo) e o glossário em [`CONTEXT.md`](../CONTEXT.md).

## Registro

```js
const registry = require('./adapters').createRegistry(host); // uma instância por início do bridge, não um singleton
registry.get('claude');      // a implementação (ou null)
registry.kinds();            // ordem de exibição: embutidos primeiro
registry.builtinKinds();     // o que veio com o bridge (continua listando um kind substituído)
const undo = registry.register(impl, { override, source, env }); // plugins; devolve a função que desfaz
```

- `register` valida a forma (`validateAdapter`) e recusa um `kind` já registrado, salvo com `override: true`.
- `undo()` remove o kind, ou devolve o embutido que ele substituiu; não faz nada se outra coisa foi registrada por cima depois.
- Cada módulo é `module.exports = host => adapter`. O `host` é o que o bridge empresta: caminhos (`ROOT`, `TMP_DIR`,
  `DEFAULT_BIN`), listas (`EFFORTS`), `fsp`, `longPath`, `startRun`, `recordWindows`.

## Interface

Campos obrigatórios:

| Campo | Tipo | Para quê |
|---|---|---|
| `kind` | texto `^[a-z][a-z0-9-]{0,39}$` | Id do Adapter (o `adapter` do Perfil) |
| `label` | texto | Nome na interface |
| `efforts` | lista de textos | Níveis de esforço aceitos |
| `genAiSystem` | texto | `gen_ai.system` da telemetria |
| `colleagues` | `native` \| `mcp` \| `none` | Como os colegas do squad são chamados: subagentes do próprio motor, pelo MCP do bridge, ou não são |
| `defaultBin(runtime)` | função | Executável quando o Perfil não tem um |
| `notFound(bin, profile)` | função | Mensagem quando o executável não existe |
| `catalog()` | função | `{ models: [{id, label}], efforts }` para a interface |
| `resolveModelEffort({opts, profile, model, effort, warn})` | função | Modelo e esforço efetivos (`warn` emite `bridge/warning`) |
| `prepare(spec)` | função (async) | Monta a execução (abaixo) |
| `finish(run, {code, durationMs})` | função | No fim: `{ usage, model? }` (tokens: `input`, `cacheRead`, `cacheWrite`, `output`, `reasoning`) |
| `refreshWindows(profile)` | função (async) | Atualiza as janelas de uso 5h/7d (o Claude roda um `claude -p` mínimo em haiku) |

Opcionais: `home`, `profileExtras`, `status`, `validateProfile` (roda depois das checagens do núcleo), `validateLaunch(opts)`
(400 antes de preparar), `nativeTelemetry(run, profile, ctx)` (telemetria própria do CLI por variáveis de ambiente), `onEvent(run,
event)` (síncrono, no caminho de cada evento: devolve `{ windows, rateLimited }` quando o evento traz isso) e `settingsFile(profile)`
(o escopo "usuário" do `settings.json` segue a pasta da conta).

### `prepare`

Recebe `{ id, run, opts, profile, model, effort, prompt, systemPrompt, env, tmpDir, files }` e devolve
`{ args, stdin, files, translator, tail, model }`:

- `args`: argumentos do executável. O prompt vai sempre por **stdin**, nunca interpolado em shell.
- `files`: arquivos temporários (system prompt, settings, agents). São do núcleo, que os apaga se algo falhar antes de o processo
  assumir: registre cada um em `files` **antes** de gravá-lo.
- `translator`: `null` quando o motor já fala o stream-json do Claude; senão um tradutor (veja `codexTranslator` em `codex.js`,
  conforme a ADR 0001) com `finish(code, durationMs)` que fecha com um `result` sintético.
- `tail`: argumentos que vão depois de tudo o que o núcleo acrescenta (o Codex põe `-` para ler o prompt do stdin depois dos `-c` da
  telemetria).
- `env`: o ambiente da execução, já montado pelo núcleo; o Adapter acrescenta o seu (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`...).

Regras que valem para todo Adapter: execução de projeto roda com cwd `projects/<pasta>` e `GIT_CEILING_DIRECTORIES`; o Claude
recebe `--settings` com `claudeMdExcludes` (`APP_MEMORY_EXCLUDES`: `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.claude/CLAUDE.md`,
`.claude/rules/**` deste app) e `permissions.blockReadsOutsideWorkingDirectories`; o Codex nunca roda com `danger-full-access`.

## Adicionar um motor

O núcleo só ganha Adapters embutidos por decisão do projeto. Um motor novo (ou da sua empresa) entra como **plugin com código**:

```js
// server.mjs de um plugin com "capabilities": ["adapter"] e o grant correspondente no squad.local.json
export function register(ctx) {
  ctx.registerAdapter('meu-motor', {
    kind: 'meu-motor', label: 'Meu motor', efforts: ['low', 'high'], genAiSystem: 'meu-motor', colleagues: 'none',
    defaultBin: () => 'meu-motor',
    notFound: bin => `meu-motor não encontrado ("${bin}").`,
    catalog: () => ({ models: [{ id: 'm1', label: 'M1' }], efforts: ['low', 'high'] }),
    resolveModelEffort: ({ model, effort }) => ({ model, effort }),
    async prepare({ prompt, model }) { return { args: ['--json'], stdin: prompt, files: [], translator: null, tail: [], model: model || 'm1' }; },
    finish: () => ({ usage: null }),
    refreshWindows: async () => ({ observed: false }),
  });
}
```

- Exige a capacidade `adapter`; substituir `claude` ou `codex` exige também `adapter.override` (só o embutido pode ser
  substituído, não o Adapter de outro plugin).
- Um Adapter de plugin roda (e é sondado com `--version`) com **ambiente mínimo** (`MIN_ENV_RE` mais as variáveis declaradas em
  `env` do manifesto), nunca recebe `nativeTelemetry` e vê uma visão restrita da execução (sem `parent`, `events`, `files`,
  `child`).
- `GET /api/health` mostra a origem de cada kind em `adapterSources` (`builtin` ou `plugin:<id>`).
- Exemplo completo e testado: `tests/fixtures/plugins/fake-adapter/`. Guia dos plugins: [`plugins/README.md`](../plugins/README.md).

Para um Adapter embutido novo: um arquivo `adapters/<kind>.js` no mesmo formato, o kind em `BUILTIN`, nas constantes `ADAPTERS`
de `plugins/loader.js` e `db.js` e no enum de `schemas/squad.schema.json` (um teste confere que as listas batem).

## Testes

`tests/adapters.test.mjs` (portas 4800-4949) cobre o registro, as funções puras de cada Adapter, o tradutor do Codex contra a
ADR 0001 e o **golden de argv**: `tests/golden-argv.json` guarda o argv e o ambiente de 7 execuções de Claude e Codex (opções
completas, Perfil próprio, sandbox read-only) capturados antes do registro existir, comparados com caminhos e porta normalizados. Mudou o
argv de propósito? Atualize o golden no mesmo commit e explique no "Desvios" de `docs/plans/perfis-adapters.md`.

```sh
node --test --test-concurrency=1 tests/adapters.test.mjs
node --test --test-name-pattern "golden" tests/adapters.test.mjs
```

Os testes usam `tests/fake-claude.mjs` e `tests/fake-codex.mjs` (sem custo de API). `npm test` roda os três arquivos de teste em
sequência (`--test-concurrency=1`).
