# Plano: Perfis, Adapter Codex, uso e telemetria

Termos em `CONTEXT.md` (Adapter, Perfil, Perfil padrão, Perfil reserva, Janela de uso, Chamado). Decisões em `docs/adr/0001..0003`.
Este documento é o contrato entre o bridge (`server.js`, `db.js`) e a UI (`src/app.js`). Mudou o contrato: atualize aqui.

## Decisões fechadas

1. Adapter = tipo no código (`claude`, `codex`). Perfil = instância criada pela pessoa.
2. Perfil por agente (`agent.profileId`, `''` = Perfil padrão) + Configuração global que pode forçar um Perfil para todas as execuções (`settings.runtime.forceProfileId`).
3. O bridge normaliza os eventos do Codex para o stream-json do Claude (ADR 0001). O cliente quase não muda.
4. Codex pela CLI: `codex exec --json`, argv em array, prompt via stdin. Sem dependência npm nova.
5. O system prompt do agente vai como prefixo no stdin do Codex: `<instrucoes-do-agente>\n...\n</instrucoes-do-agente>\n\n<tarefa>\n...\n</tarefa>`.
6. Sandbox do Codex derivado das tools do agente: sem `Edit`, `Write` e `Bash` → `--sandbox read-only`; com qualquer um deles → `workspace-write`. Sempre `-c approval_policy="never"` e `-C <cwd>`. Nunca `danger-full-access`.
7. Chamados no Codex pelo MCP do bridge (ADR 0003). O Claude continua com `--agents`.
8. Monitor: tokens por execução + Janelas de uso (5h/7d) por Perfil. Só execuções do app. Sem custo USD estimado para o Codex (o `total_cost_usd` do Claude continua sendo gravado como hoje).
9. Telemetria: o bridge emite OTLP/HTTP JSON (um trace por execução) com atributos `squad.*`; a telemetria nativa das CLIs pode ser ligada por Perfil. Conteúdo (prompt/resposta) só se o Perfil ligar `telemetry.content`. Segredos só como nome de variável de ambiente (ADR 0002).
10. Perfis no `squad.db`, fora do workspace (ADR 0002).
11. Concorrência: teto global (como hoje) + teto por Perfil (padrão 2).
12. Janela de uso ≥ limiar (padrão 90%) com reset no futuro: aviso; se o Perfil tiver Perfil reserva do mesmo Adapter, a execução vai para ele e isso fica registrado.
13. Perfil Codex: interruptor `ignoreUserConfig` (padrão ligado → `--ignore-user-config`). Medir também como cortar a descoberta de skills (um "ok" custou ~20k tokens de input mesmo com `--ignore-user-config`); se houver flag/feature estável que corte isso sem perder o login, ligar junto do interruptor.
14. Catálogo de modelos e esforços por Adapter. Esforço no Codex = `-c model_reasoning_effort="<low|medium|high|xhigh>"` (`max` → `xhigh`; `minimal`/`low` como estão).
15. UI: Configurações > Perfis (CRUD, testar, atualizar uso, reserva, teto, limiar, telemetria) e bloco "Uso dos perfis" no Painel. Chip do Perfil no card do agente e na sala.
16. Janelas: atualizadas passivamente a cada execução; botão "Atualizar" (Claude: chamada mínima no haiku; Codex: lê o arquivo de sessão mais recente). Mostrar a idade do valor.
17. Migração: cria "Claude (padrão)" (sem config dir, binário = `SQUAD_CLAUDE_BIN`/runtime) como Perfil padrão; se `codex` estiver no PATH, cria "Codex (padrão)" (nenhum agente usa).
18. Editor de settings.json: o escopo `user` recebe `profile=<id>` de um Perfil Claude e edita `<configDir>/settings.json` (sem configDir: `~/.claude/settings.json`).

## Bridge (`server.js`, `db.js`)

### Banco (migração por `user_version`, nunca DROP)

- `profiles (id TEXT PK, name TEXT UNIQUE, adapter TEXT, bin TEXT, config_dir TEXT, model TEXT, effort TEXT, concurrency INTEGER DEFAULT 2, fallback_id TEXT, threshold INTEGER DEFAULT 90, ignore_user_config INTEGER DEFAULT 1, telemetry TEXT /* JSON {enabled, native, content} */, is_default INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)`. Exatamente um `is_default=1` entre os Perfis.
- `profile_windows (profile_id TEXT, window TEXT /* five_hour | seven_day */, utilization REAL /* 0..1 */, resets_at TEXT, observed_at TEXT, PRIMARY KEY (profile_id, window))`.
- `runs` ganha: `profile_id, adapter, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens, parent_run_id`.
- `bridge_settings (key TEXT PK, value TEXT)`: chave `telemetry` = `{endpoint, headersEnv: {"<header>": "<ENV_NAME>"}, serviceName}`.
- Sem banco (setup pendente): execuções usam um Perfil padrão em memória equivalente ao "Claude (padrão)"; `/api/profiles` responde 503 em escrita.

### Opções de execução

- `options.profile` (id; vazio/desconhecido → Perfil padrão). Resolução em `startRun`: Perfil → (Janela ≥ limiar e reserva válida? reserva) → teto do Perfil (excedido: 429 com mensagem que cita o Perfil) → teto global.
- `options.claudePath` continua valendo só quando o Perfil não define `bin`.
- Claude: `env.CLAUDE_CONFIG_DIR = config_dir` quando definido. Codex: `env.CODEX_HOME = config_dir` quando definido.
- `maxBudgetUsd` não existe no Codex: ignorar e emitir `{type:'bridge', subtype:'warning', message}`.
- Evento `{type:'bridge', subtype:'profile', profileId, name, adapter, fallbackFrom?}` logo após `spawned`.

### Adapter codex: argv

`codex exec --json -C <cwd> --sandbox <modo> -c approval_policy="never" [--ignore-user-config] [-m <model>] [-c model_reasoning_effort="<e>"] [--add-dir <d>]... [MCP squad] -` (prompt pelo stdin). Projeto já é repositório git; para `cwd` explícito sem git, `--skip-git-repo-check`.

### Adapter codex: tradução de eventos (→ stream-json do Claude)

| Codex | Emitido |
|---|---|
| `thread.started {thread_id}` | `{type:'system', subtype:'init', session_id, model, adapter:'codex'}` |
| `item.completed agent_message {text}` | `{type:'assistant', message:{role:'assistant', content:[{type:'text', text}]}}` |
| `item.started command_execution {id, command}` | assistant `tool_use {id, name:'Bash', input:{command}}` |
| `item.completed command_execution {id, aggregated_output, exit_code}` | `{type:'user', message:{content:[{type:'tool_result', tool_use_id:id, content:<até 4000>, is_error: exit_code!==0}]}}` |
| `file_change {id, changes[]}` | `tool_use {name:'Edit', input:{changes}}` + `tool_result` |
| `mcp_tool_call` do servidor `squad`, ferramenta `chamar_colega` | `tool_use {id, name:'Agent', input:{subagent_type:<slug>, description:<pedido curto>, prompt:<pedido>}}`; resultado → `tool_result` |
| outro `mcp_tool_call` / `web_search` | `tool_use` com o nome `mcp__<server>__<tool>` / `WebSearch` + `tool_result` |
| `reasoning`, `todo_list` | ignorados |
| `item.* error` | `{type:'bridge', subtype:'warning', message}` (sem quebrar a execução) |
| `turn.completed {usage}` | acumula uso |
| `turn.failed` / `error` | marca erro |
| fim do processo | `{type:'result', subtype, is_error, result:<último agent_message>, session_id, num_turns, duration_ms, total_cost_usd:null, usage:{input_tokens, cache_read_input_tokens:<cached_input_tokens>, cache_creation_input_tokens:<cache_write_input_tokens>, output_tokens, reasoning_output_tokens}}` |

### Uso por execução

- Claude: do `result.usage` (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`, `output_tokens_details.thinking_tokens`) e `model` do `system init`/`modelUsage`.
- O evento `exit` ganha `usage:{input, cacheRead, cacheWrite, output, reasoning}`, `profileId`, `adapter` e `model`; tudo é gravado em `runs`.

### Janelas de uso

- Claude: `rate_limit_event.rate_limit_info.unifiedWindows.{five_hour, seven_day}.{utilization, resetsAt}` (utilization 0..1, resetsAt epoch s) → `profile_windows`.
- Codex: ao fim da execução, ler o arquivo de sessão `<CODEX_HOME>/sessions/YYYY/MM/DD/*<thread_id>.jsonl` (sem seguir symlink, só leitura, tamanho limitado), último `rate_limits` com `primary` (300 min → five_hour) e `secondary` (10080 min → seven_day), `used_percent/100`, `resets_at`.

### MCP do bridge (`POST /mcp`)

- Só 127.0.0.1, Host local, `Authorization: Bearer <token da execução>` (32 bytes aleatórios, criado por execução Codex que tenha `agents`, revogado no fim). Nunca o token da página.
- JSON-RPC 2.0, respostas `application/json`: `initialize`, `notifications/initialized` (202), `tools/list`, `tools/call`, `ping`.
- Ferramenta `chamar_colega {agente: <slug de options.agents>, pedido: string}`: roda uma execução filha (mesmo `project`/cwd, `parent_run_id`, `meta.kind:'call'`) com o `prompt` do colega como system prompt, o Perfil do colega (`agents[slug].profile`, novo campo opcional do `validateAgents`), suas tools/model/effort, sem `agents` (sem aninhar). Espera terminar e devolve o `result` (ou o erro) como `content:[{type:'text'}]`. O texto da filha é repassado ao stream da mãe com `parent_tool_use_id` = id do item `mcp_tool_call` aberto mais recente (melhor esforço).
- No argv: `-c mcp_servers.squad.url="http://127.0.0.1:<port>/mcp"`, `-c mcp_servers.squad.bearer_token_env_var="SQUAD_MCP_TOKEN"`, `-c mcp_servers.squad.tool_timeout_sec=<timeout>`; o token só no env do filho.

### Telemetria (OTLP/HTTP JSON, zero dependência)

- Destino: `bridge_settings.telemetry` ou, na falta, `OTEL_EXPORTER_OTLP_ENDPOINT`. Headers: `headersEnv` → valor lido de `process.env` na hora do envio; variável ausente = header não enviado e status "faltando" na API. Nunca logar valor.
- Envio só se o Perfil da execução tiver `telemetry.enabled`. Fire-and-forget, timeout curto, falha nunca derruba a execução.
- Trace por execução: `traceId` = 16 bytes de sha256(runId); span raiz `squad.run` com `squad.project`, `squad.project_id`, `squad.agent_id`, `squad.feature_id`, `squad.kind`, `squad.profile`, `squad.adapter`, `gen_ai.system` (`anthropic`|`openai`), `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read_input_tokens`, `squad.status`. Spans filhos por ferramenta (de `tool_use` a `tool_result`, só nome e erro) e por Chamado (span da execução filha com o mesmo traceId e parent = span da ferramenta).
- `telemetry.content`: adiciona `gen_ai.prompt` e `gen_ai.completion` (cortados em 16k).
- `telemetry.native`: Claude → `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, `OTEL_EXPORTER_OTLP_HEADERS` (valores do env), `OTEL_RESOURCE_ATTRIBUTES` com os `squad.*`, `OTEL_LOG_USER_PROMPTS=1` só com `content`. Codex → `-c otel.*` só se não houver headers com segredo (segredo nunca no argv); senão, aviso e nativo desligado.

### API

- `GET /api/profiles` → `{profiles:[{id, name, adapter, bin, configDir, model, effort, concurrency, fallbackId, threshold, ignoreUserConfig, telemetry, isDefault, status:{resolved, version, configDirOk, error}, windows:{five_hour:{utilization, resetsAt, observedAt}, seven_day:{...}}, active}], adapters:{claude:{models, efforts}, codex:{models, efforts}}}`.
- `POST /api/profiles`, `PUT /api/profiles/:id`, `DELETE /api/profiles/:id` (recusa o padrão; reserva que aponta para ele é limpa). Validação: nome 1..40, adapter do enum, `configDir` absoluto (aceita `~`), existente e diretório; `bin` resolvível; reserva do mesmo Adapter e diferente de si; concurrency 1..10; threshold 50..100.
- `POST /api/profiles/:id/default`, `POST /api/profiles/:id/test` (versão + configDir), `POST /api/profiles/:id/refresh` (atualiza Janelas: Claude roda `claude -p` mínimo no haiku com `--tools ""`, `kind:'probe'`, fora da sala; Codex lê o arquivo de sessão mais recente).
- `GET /api/usage?from=<iso>&to=<iso>&by=profile|agent|project|day` → somas de tokens e número de execuções.
- `GET /api/telemetry` → `{endpoint, serviceName, headers:[{name, env, present}]}`; `PUT /api/telemetry`.
- `/api/health` ganha `profiles: n`. `settingsPath('user', …, profile)` segue o `configDir` do Perfil Claude.

### Testes (`tests/bridge.test.mjs`, `tests/fake-codex.mjs`)

`fake-codex.mjs` imita `codex exec --json` (eventos acima, roteiro por variável de ambiente, grava argv/env/stdin recebidos num arquivo para asserção, opcionalmente chama o MCP do bridge). Casos: migração cria os Perfis padrão; CRUD e validação; `CLAUDE_CONFIG_DIR`/`CODEX_HOME` no env do filho; argv do Codex (sandbox derivado, ignore-user-config, esforço) e system prompt no stdin; tradução dos eventos e `result` sintético; uso gravado em `runs`; Janela do `rate_limit_event` gravada; Perfil reserva usado acima do limiar; 429 por teto do Perfil; MCP (`tools/list`, `chamar_colega` roda a filha no Perfil do colega, token errado = 401); OTLP enviado a um servidor de teste com atributos `squad.*` e sem conteúdo por padrão; `GET /api/telemetry` nunca devolve valor de segredo.

## UI (`src/app.js`, `src/styles.css`, `src/shell.html`)

- `agent.profileId` (persistido: `normalizeWorkspace` + `seedWorkspace` + `defaultAgent`/`presetDefaults`), `settings.runtime.forceProfileId` (em `DEFAULT_RUNTIME` e no normalize).
- Perfis carregados de `GET /api/profiles` no boot e em Configurações (`ui.profiles`, transitório; sem bridge: só o padrão implícito e os controles desabilitados com aviso).
- `runOptionsFor` envia `profile: runtime.forceProfileId || a.profileId || ''`. `stepRunOptions`: cada colega em `agents` leva `profile`. `buildStepPrompt`/`CALLED_AGENT_SYSTEM`: quando o Adapter efetivo do agente é `codex`, a instrução de chamada cita a ferramenta `chamar_colega` em vez de `Agent`.
- Estúdio do agente: seletor de Perfil ("Padrão (<nome>)" + Perfis), e o catálogo de modelo/esforço segue o Adapter do Perfil efetivo (`CLAUDE_MODELS` vs `CODEX_MODELS`, vindos de `adapters` da API com fallback local). Chips de modelo/esforço (`coWriterModel`, `effortChipHTML`) seguem a mesma regra.
- Configurações > Perfis: lista com status, Janelas (barras 5h/7d com idade), formulário (nome, Adapter, executável, diretório de configuração, modelo, esforço, teto, limiar, reserva, ignorar config do usuário no Codex, telemetria: ligada/nativa/conteúdo), botões Testar, Atualizar, Tornar padrão, Excluir (confirmação em linha, nunca `confirmAction` dentro de outro modal). Seletor "Forçar Perfil em todas as execuções". Bloco Telemetria: endpoint, serviceName, headers como pares header → nome da variável, com indicador presente/faltando.
- Painel: bloco "Uso dos perfis" (`opsBlock`, assinatura sem valores em edição): por Perfil, barras 5h/7d, tokens hoje e 7 dias (input/cache/output), execuções ativas/teto; expansão por agente e por operação (`/api/usage`).
- Chip do Perfil (nome curto + cor do Adapter) no card do agente (rede/escritório quando couber) e nas falas da sala (`roomStepStart`), e aviso na sala quando o bridge emitir `profile` com `fallbackFrom`.
- Chats com Perfil Codex: sem deltas; a bolha aparece no fim (o `chatStream` precisa tolerar só `assistant` + `result`).
- Editor de settings.json: escopo usuário com seletor de Perfil Claude (`profile=`).
- Textos em pt-BR, sem travessão nos textos de agente. `node --check src/app.js` após cada edição. Não reformatar o arquivo.

## Fases

1. Paralelo: (A) bridge + testes (`server.js`, `db.js`, `tests/*`); (B) UI (`src/app.js`, `src/styles.css`, `src/shell.html`) contra este contrato.
2. Integração: build, `npm test`, verificação headless da UI com o bridge real e os fakes.
3. Revisão pelo Codex (`codex review`), correções, teste local da pessoa, commit e PR.

## Desvios (bridge)

Registrados pela implementação do bridge; o contrato acima continua valendo onde não há nota aqui.

- **Chamados fora dos tetos.** A execução filha de `chamar_colega` não é barrada nem conta na admissão (teto global e do Perfil): a mãe já ocupa uma vaga e fica esperando; contar travaria com teto 1. `GET /api/profiles` mostra `active` (execuções que contam no teto) e `activeCalls` (Chamados em andamento no Perfil, só informativo). O Perfil reserva vale para ela como para qualquer execução.
- **Admissão sem corrida.** A vaga (global e do Perfil) é reservada de forma síncrona antes do primeiro `await` de `startRun` e devolvida quando a execução entra na lista (ou falha ao iniciar); pedidos paralelos não passam do teto.
- **Reserva.** Só um salto, e só se a própria reserva não estiver acima do limiar dela; senão a execução fica no Perfil pedido.
- **Limite no meio da execução.** O bridge não refaz a execução (1 run = 1 processo): quando o Claude emite `rate_limit_event` com `status: "rejected"` (o adapter devolve `rateLimited` em `onEvent`) e a execução termina com erro, o `exit` (e o resultado gravado no histórico) leva `rateLimited: true`, `profileName` e, se `pickProfile` do Perfil pedido agora devolve outro Perfil fora do limiar, `retryProfile: {id, name}`; `run:finish` e a projeção de `run:event` não mudam (contrato dos plugins). O app relança a mesma etapa uma vez (o bridge escolhe a reserva); sem `retryProfile` a mensagem diz que não há reserva. Vale só para as etapas de execução (plano do comandante e chats têm outro caminho de erro). Codex: sem sinal equivalente no stream (`codex exec --json` não marca o limite; as Janelas vêm do arquivo de sessão no fim), fica de fora.
- **Esforço do Codex.** Aceitos `minimal|low|medium|high|xhigh|max|ultra`. `max`/`ultra` só passam como estão se o modelo efetivo os lista em `<CODEX_HOME>/models_cache.json` (no 0.161 os modelos `gpt-6*`/`gpt-5.6*` aceitam `max`); caso contrário viram `xhigh`. No Claude continua só `low..max` (400 se vier `minimal`/`ultra`).
- **Modelo do Claude num Perfil Codex.** Se `options.model` parece do Claude (`opus|sonnet|haiku|claude*|inherit|default`), o bridge usa o modelo do Perfil (ou o padrão da conta) e emite `bridge/warning`.
- **`adapters` em `GET /api/profiles`.** `models: [{id, label}]`; Codex lê os modelos visíveis de `models_cache.json` (fallback `gpt-5.5`) e traz também `modelEfforts: {modelo: [esforços]}`.
- **`GET /api/usage`.** `rows: [{key, label?, runs, input, cacheRead, cacheWrite, output, reasoning, costUsd}]`; `label` = nome do Perfil quando `by=profile`; `key` `null` quando a execução não tinha aquele campo. Probes (`kind:'probe'`) ficam fora. Lê da tabela `usage_daily` (migração `user_version` 3, com backfill das runs existentes), acumulada em `finishRun`/execuções interrompidas, então os totais não encolhem com a poda do histórico (últimas 300 runs). Granularidade de dia UTC do início da execução: `from` vale pelo dia; `to` é exclusivo (um `to` no meio do dia inclui aquele dia).
- **Histórico.** `GET /api/runs` e `/api/runs/:id` ganham `profileId, adapter, model, parentRunId, usage`. `RUN_KINDS` ganhou `call` e `probe`.
- **`spawned`** leva `adapter`. O evento `exit` leva `usage, profileId, adapter, model` (Codex: modelo lido do `turn_context` do arquivo de sessão).
- **`/api/health`.** Novos `profiles` (n), `engines: {claude, codex}` (algum Perfil daquele Adapter com executável que responde `--version`), `engineAdapter`, `enginePath`. `claudeVersion` continua sendo a versão do Claude; se não houver Claude utilizável mas houver Codex, recebe a versão do Codex (a página sai do modo demo); `claudeError` segue sendo o erro do Claude.
- **`agents[slug]`** aceita, além de `profile`, `agentId` opcional (vai para `runs.agent_id` da filha). Os dois ficam fora do arquivo `--agents` do Claude.
- **MCP.** `tools/list` traz `annotations`; o argv do Codex ganha `-c mcp_servers.squad.tools.chamar_colega.approval_mode="approve"`: com `approval_policy="never"` o Codex 0.161 recusa chamadas MCP que pedem aprovação ("MCP tool call requires approval, but approval policy is never"), visto numa chamada real. `initialize` devolve a `protocolVersion` pedida pelo cliente. `GET /mcp` → 405.
- **MCP endurecido.** Só colegas próprios de `options.agents` (objetos sem protótipo e `Object.hasOwn`: `constructor`/`toString` são desconhecidos). A mãe é revalidada depois de ler o corpo do pedido e de novo imediatamente antes do spawn da filha (sem `await` entre a checagem, o spawn e o registro em `children`); mãe encerrada, cancelada ou com tempo esgotado → 401 (corpo chegou tarde) ou erro na ferramenta, e nenhuma filha nasce. O fim da mãe mata as filhas registradas.
- **Erro de stream do Codex.** Evento `error` de nível de stream marca a execução como falha (mesmo com saída 0 e turno concluído); `item.completed` do tipo `error` continua só aviso.
- **Arquivos de sessão do Codex.** Cada componente abaixo de `CODEX_HOME` (`sessions/AAAA/MM/DD`) passa por `lstat` e não pode ser symlink (guardamos dispositivo/inode de cada um); o arquivo abre com `O_NOFOLLOW`, e depois de aberto a cadeia inteira é verificada de novo (sem symlink, mesmos dispositivo/inode da primeira passada) e o `fstat` do fd tem de bater com o `lstat` do caminho; qualquer diferença descarta a leitura. O próprio `CODEX_HOME` pode ser um link (escolha da pessoa). **Risco residual:** sem `openat` no Node, ainda existe uma janela entre as verificações e a abertura em que um componente pode ser trocado e trocado de volta; a ameaça exige um processo do mesmo usuário com escrita em `CODEX_HOME`, e o bridge só extrai números (percentuais, resets, nome do modelo) do arquivo, nunca devolve o conteúdo.
- **Run em memória.** `GET /api/runs/:id` de uma execução ainda em memória traz `profileId, adapter, model` (o efetivo, depois do fim), `parentRunId, usage, costUsd, durationMs, sessionId`, como o caminho do SQLite.
- **`modelEfforts` por Perfil.** Em `GET /api/profiles`, cada Perfil Codex traz `modelEfforts` lido do `models_cache.json` do próprio diretório de configuração (ou do `CODEX_HOME` padrão sem ele); `adapters.codex` continua vindo do `CODEX_HOME` padrão. A UI deve usar o do Perfil efetivo.
- **Variáveis de telemetria herdadas.** O env do filho perde `OTEL_*`, `CLAUDE_CODE_ENABLE_TELEMETRY`, `CLAUDE_CODE_OTEL_*`, `BETA_TRACING_ENDPOINT` e `ENABLE_BETA_TRACING_DETAILED` herdados do bridge; só o que o Perfil liga (`nativeTelemetry`) volta. Com `content:false`, `OTEL_LOG_USER_PROMPTS` nunca chega.
- **Endpoint com credenciais.** `PUT /api/telemetry` recusa URL com usuário/senha (400); um `OTEL_EXPORTER_OTLP_ENDPOINT` assim é ignorado (endpoint vazio), e um valor desses já gravado também.
- **Codex sem git.** `--skip-git-repo-check` quando nenhuma pasta acima do cwd tem `.git` (em execução de projeto, só a própria pasta conta).
- **Telemetria.** `GET/PUT /api/telemetry` devolvem também `source` (`settings`|`env`|`''`). Spans por ferramenta saem de `tool_use`→`tool_result` do próprio stream (não dos eventos repassados da filha). Traces vão para `<endpoint sem /v1/...>/v1/traces`. Nativa do Codex: `-c otel.exporter={otlp-http=...}`, `-c otel.trace_exporter=...`, `-c otel.log_user_prompt=<content>` (chaves validadas com `--strict-config` no 0.161).
- **Teste antigo "run history survives a restart".** Falhava fora do Windows: `proc.kill()` manda SIGTERM, o shutdown gracioso cancela a execução (fica `cancelled`). O teste agora mata com SIGKILL (o que o comentário já supunha). Sem mudança no bridge.

### Decisão 13: descoberta de skills do Codex (medido no codex-cli 0.161.0)

Uma chamada real "responda só: ok" com `--ignore-user-config` e mais `-c skills.include_instructions=false -c skills.bundled.enabled=false -c include_apps_instructions=false -c features.plugins=false -c features.apps=false -c features.memories=false` gastou 13.059 tokens de input (6.144 em cache), contra ~20k só com `--ignore-user-config`. O resto é o prompt base do Codex (~22 KB), as ferramentas e o `AGENTS.md` global de `CODEX_HOME` (este não é cortado). Todas as chaves foram validadas com `codex exec --strict-config` (chave desconhecida dá erro). O login continua vindo de `CODEX_HOME`. Ficam ligadas junto do interruptor `ignoreUserConfig`. A feature `skip_host_skill_discovery` existe mas está "under development": não usada. Não cortamos `include_permissions_instructions` nem `include_environment_context` (o agente precisa saber o sandbox e o cwd).

Na chamada real com MCP (uma rodada, sem a aprovação acima) o input foi 42k (34,5k em cache): cada chamada de ferramenta é mais um pedido ao modelo com o contexto inteiro.
- **Perfis da configuração.** `squad.config.json` / `squad.local.json` declaram Perfis (`profiles`, `defaultProfile`), sincronizados como `cfg-<key>` com `source:'config'` + `sourceFile` (migração `user_version` 4). PUT/DELETE/default gravam no arquivo de origem (só os campos alterados, `.bak`, 409 se o arquivo mudou desde a leitura); item inválido não trava os outros. Contrato em `docs/plans/plugins-conteudo.md` (seções Perfis da configuração, Gravar no arquivo de origem e JSON Schema).
- **Revisão do Codex (PR #2).** `PUT /api/profiles/:id` recusa (400) trocar o Adapter de um Perfil do banco, como já fazia com os da configuração: a reserva de outro Perfil (mesmo Adapter) deixaria de valer e o failover pararia em silêncio. A sonda `<bin> --version` é uma por executável resolvido: a sonda em voo é compartilhada, o sucesso fica em cache como antes e a falha (e a busca no PATH por nome) vale 30 s (`PROBE_RETRY_MS`). Remover o último Perfil da configuração nunca deixa o banco sem padrão: promove "Claude (padrão)" ou o primeiro que sobrou e, sem nenhum, recria "Claude (padrão)". `PUT /api/telemetry` com o mesmo valor de `OTEL_EXPORTER_OTLP_ENDPOINT` grava o endpoint vazio (continua herdado); a página guarda `source` e deixa o campo vazio quando herdado, com o valor no placeholder. O Painel pede `/api/usage` com limites UTC explícitos: hoje = o dia UTC atual, 7 dias = hoje e os 6 anteriores, `to` = a próxima meia-noite UTC.
- **Colegas chamados por um agente de Perfil Claude (versão leve).** O colega roda como subagente nativo (`--agents`) na sessão, no Perfil e na conta de quem chamou; o `profile` do colega só vale quando quem chama é Codex (chamado pelo MCP do bridge). A página só manda `profile` em `agents` para quem chama com Perfil Codex, o cartão do chamado na sala avisa "roda no Perfil de quem chamou (<Perfil>)" quando o Perfil do colega seria outro, e o estúdio do agente explica a regra no seletor de Perfil. Rotear chamados mistos pelo bridge (colega Claude em outro Perfil chamado por um agente Claude) fica para depois.
- **Segunda revisão do Codex (PR #2).** Sem `claude` e com `codex` no PATH, o "Codex (padrão)" criado num banco novo vira o Perfil padrão quando o "Claude (padrão)" ainda é o intocado (um `defaultProfile` da configuração continua valendo), senão todo agente sem Perfil caía no Claude ausente. Chamados `chamar_colega` abertos ao mesmo tempo: cada requisição MCP consome a chamada pendente com os mesmos argumentos (senão a mais antiga ainda livre), uma vez só, em vez da última aberta, para o texto e o span pai irem ao cartão certo.
- **Esforço efetivo (PR #3).** O nível conferido contra os do Adapter na execução é o efetivo (`opts.effort || profile.effort`): um Perfil salvo com um nível que o Adapter atual não anuncia (Adapter substituído por plugin depois) recebe 400 claro, antes da vaga e do `prepare`.
