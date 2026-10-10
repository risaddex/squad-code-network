# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SQUAD/CODE is a single-page web app for organizing a squad of software-development
agents (commander, ADR/PRD "reconhecedores", operators) that execute features through headless Claude
Code (`claude -p`). The bridge keeps the app's data in a local SQLite database (`better-sqlite3`, the only npm dependency). UI text is Portuguese (pt-BR); code identifiers are English. Git repo; `origin` is github.com/felipeAguiarCode/squad-code-network.

## Commands

```sh
npm install                 # better-sqlite3 (prebuilt binary; Node >= 22)
npm run dev                 # build index.html from src/, start the bridge, rebuild on src/ changes, restart on server.js / db.js / plugins.js / plugin-host.js / schema.js / schemas/ / adapters/ changes
npm start                   # node server.js → http://127.0.0.1:4317 (--port N or SQUAD_PORT; SQUAD_CLAUDE_BIN for another claude; SQUAD_PROJECTS_DIR for another projects root; SQUAD_DATA_DIR for another database folder; SQUAD_CONFIG / SQUAD_PLUGINS for plugins)
python build.py [--copy]    # full build: regenerates src/avatars.js (needs Pillow), writes index.html (--copy: also ../squad-code-network.html)
npm test                    # bridge, adapter and plugin tests: node --test --test-concurrency=1 tests/bridge.test.mjs tests/adapters.test.mjs tests/plugins.test.mjs (fake engines, no API cost; never `tests/`, which would run the fakes)
node --test --test-name-pattern "<test name>" tests/bridge.test.mjs   # single test (or tests/adapters.test.mjs / tests/plugins.test.mjs)
node --check src/app.js     # quick syntax check after edits
python tests/ui_test.py     # optional UI tests (needs Playwright + Chromium; CHROMIUM_EXECUTABLE, SQUAD_PREVIEW_DIR)
node scripts/vendor-three.mjs [version]   # regenerate src/vendor/three.min.js (only classes in scripts/three-entry.js)
```

`index.html` is a build artifact — never edit it; edit `src/` and rebuild. Opening `index.html` via
`file://` runs in demo mode (deterministic local simulation, no bridge). `npm run dev` does not
regenerate `src/avatars.js`; `python build.py` does (and the `../squad-code-network.html` copy only with `--copy`, so a
clone never writes outside its folder).

## Build model and its pitfalls

`build.py` / `scripts/dev.mjs` inline `src/styles.css` into `src/shell.html` and concatenate, **in this
order**, into one classic `<script>`: `portraits.js`, `avatars.js`, `conventions.js`,
`souls.js`, `vendor/three.min.js`, `city.js`, `app.js`. Consequences:
- Everything shares one global scope; `state`, `ui`, `MapNetwork`, `ICONS`, `ROLES`… are reachable
  from the page (handy for headless-browser checks; `window.SquadCode.getSnapshot()` returns a clone of
  the workspace).
- `app.js` initializes state at load time (`seedWorkspace` / `normalizeWorkspace`), so any helper used
  during initialization must be a **function declaration** (hoisted). A `const` arrow defined later in
  the file throws a TDZ `ReferenceError` and the whole app fails to boot.
- `src/app.js` is written in dense, minified-style long lines. Make edits by exact unique string
  replacement and re-run `node --check`; do not reformat the file.
- Asset pipeline: `scripts/build-avatars.py` turns `assets/*.png` into 320px JPEG data URLs in
  `src/avatars.js` (`avatar-<file-name>` keys merged into `PORTRAITS`). `src/portraits.js` holds the
  embedded role portraits. Template agents get their photo from `TEMPLATE_AVATARS` (codename → `PORTRAITS`
  key), not from a stored copy: `image` stays `''` ("Automático") and `portrait(a)` resolves it, falling back
  to the specialty's default agent (`rolePortrait`). A new asset or template needs an entry there.

## Architecture

**`server.js` (bridge) + `db.js` (SQLite).** Serves `index.html` (injecting a per-start random token), binds to
127.0.0.1 only, and every `/api` call needs the token plus local Host/Origin. `/api/runs` spawns
`claude -p --output-format stream-json --verbose --permission-prompts none`, writes the agent's system
prompt to a temp file passed as `--append-system-prompt-file`, sends the step prompt via **stdin**
(never shell-interpolated), and streams events back. Options (permission mode, effort, tools, model,
dirs, budget, `partial` → `--include-partial-messages`) are whitelisted. Limits: body 2 MB, prompt 400k chars, system prompt 100k (silently
sliced). It also reads/writes Claude `settings.json` files (user/project/local) with a `.bak` copy.
Every project runs in its own folder: the `project` option (a plain slug, `FOLDER_RE`, no Windows reserved names) becomes the
cwd `<PROJECTS_DIR>/<folder>` (`./projects` next to `server.js`, created at start; `SQUAD_PROJECTS_DIR` for tests), created on the
first run. Because Claude Code loads CLAUDE.md from every folder above the cwd, those runs also get `--settings <temp file>` with
`claudeMdExcludes` (`APP_MEMORY_EXCLUDES`) so agents never see this app's own CLAUDE.md/AGENTS.md/rules. Each project folder is its
own git repository (`ensureProjectRepo`: `git init` before a run when `.git` is missing; skipped without git) and project runs get
`GIT_CEILING_DIRECTORIES` = PROJECTS_DIR (`gitCeiling`), so Claude Code (git status, `.claude/settings.json` from the repo root outside
Windows) and the agents' git commands never reach the enclosing repository (this app's clone). The same settings file sets
`permissions.blockReadsOutsideWorkingDirectories`, so the file tools refuse reads outside the folder (and `--add-dir`). An explicit `cwd` stays as a fallback
(tests, direct API use); a run with neither `project` nor `cwd` is refused (never `process.cwd()`, the app folder). The step prompt
(`buildStepPrompt`) and `CALLED_AGENT_SYSTEM` tell agents to keep every file inside the folder. The settings.json project/local scopes
take `project=` as well.
Data: `db.js` (`openStore(DATA_DIR)`, `SQUAD_DATA_DIR`, default `./data`, git-ignored) opens `squad.db` (WAL, foreign keys, migrations
by `user_version`); without better-sqlite3 the bridge exits at start telling to run `npm install` (`driverError`). **The database is
created only by the person:** at start (inside the `listen` callback, so a second bridge on a busy port exits with a clear message
before touching it) `openDb()` runs only if `squad.db` or a legacy `workspace.json` exists. Otherwise `store` stays null and nothing is
written: `setupNeeded()` (no store, or no workspace row) sets `setup:true` in `#squad-disk` and `dbReady:false` in `/api/health`;
`PUT /api/workspace` answers 503 and versions/rooms/chats go through `needStore()` (503); runs still work, out of the history.
`POST /api/setup` (`checkWorkspace` before any disk write, 409 once a workspace exists) opens the store and writes the first workspace.
The startup log also checks Node ≥ 22 and the `claude` executable (`claudeVersion`). **Workspace:** one table per entity under a
root row (`TREE`: agents, convention_templates/subsets, squads, projects → adrs, sprints, features → feature_outputs, logs, handoffs).
Each row keeps the entity's own JSON (`data`) with child arrays left as `[]` in place, so assembly is byte-identical to what the page
sent (no field list besides `normalizeWorkspace`), plus `json_extract` generated columns for SQL. **A new child array of the workspace
needs an entry in `TREE`**; plain fields need nothing. `syncWorkspace` (one `.immediate()` transaction) diffs rows by `(parent, key)`
and hash (`key` = id, `#n` for missing/duplicate ids, outputs `at|agentId`; positions are append-aware), never `INSERT OR REPLACE`.
Contract kept from the file version: `serveIndex` injects `<script type="application/json" id="squad-disk">` (`{rev, savedAt, path,
workspace, error, setup}`, every `<` escaped, function replacement because the text may hold `$&`); `GET /api/workspace` (`?meta=1` without
the workspace), `PUT /api/workspace?base=<rev>` (64 MB; a stale `base` gets 409 unless `force=1`; returns `changes`/`unchanged`; `rev`
is 16 random hex per changing write), `POST /api/workspace/backups`. **Versions** (`snapshots`, deflated JSON, newest 30): the previous
workspace on the first changing write of each bridge start and on `force`, browser copies (`navegador`), the migration; `GET
/api/workspace/snapshots[/:id]`. On first start a `data/workspace.json` (+ `backups/*.json`) is imported (rev = sha1-16 of the file
text, so browsers still match) and the files move to `data/legacy-json/`. A second tag `#squad-memory` carries `{rooms, chats}` (last
200 room messages per project; `sweep` first drops chats/rooms of features, agents or projects that no longer exist). `POST
/api/rooms/:projectId` `{seq, upserts, removes}` (ids `rm<n>`, texts cut to the room's limits, 800 kept); `PUT|DELETE
/api/chats/:kind/:key` (feature, agent, doc; 300 messages kept). Runs: `insertRun` at spawn (`body.meta` whitelisted by `runMeta`:
projectId, agentId, featureId, kind), events batched every 200 ms (`persistEvent`; no `stream_event`, tool results cut at 4000, exit
always kept), `finishRun` on close; at start runs left `running` become `interrupted` with a synthetic exit event; newest 300 kept.
`GET /api/runs` (`?projectId`, `limit`) lists the history, and `/api/runs/:id[/events]` fall back to it for runs not in memory; the
console's **Histórico** (`openConsoleHistory` → `replayRun`, client `runMeta` on the four `POST /api/runs`) replays them.
Squad colleagues: the `agents` option (whitelisted CLI subagent fields: `description`, `prompt`, `tools`, `model`, `effort`) is written
to a temp file passed as `--agents <file>`, and `forwardSubagents:true` adds `--forward-subagent-text`. Runs with agents get
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, so an `Agent` tool call runs in the foreground and its tool_result is the colleague's
report (framed as "[Subagent hand-back] ... The report follows:" with indented lines; `subagentReport` unwraps it).

**Plugins and local config (`plugins.js`, contract in `docs/plans/plugins-conteudo.md`).** Company- or taste-specific catalog content
(agents, categories, souls, DIRETRIZES, avatars, map themes, runtime defaults) never goes in `src/`: it comes from **plugins**,
folders outside the repo listed in `"plugins": {"paths", "disabled"}` of `squad.config.json` (shareable, optional) and `squad.local.json` (git-ignored; local wins;
`SQUAD_CONFIG` replaces the local file, `SQUAD_PLUGINS` adds folders). `createPluginLoader` reads `squad-plugin.json`, `agents/*.md`
(strict YAML-subset frontmatter, body = the preset's `style`, alphabetical file order = catalog order), `avatars/*` (signature
checked, data URLs, no SVG), `conventions.json` and themes, inside the plugin's realpath, with size/count limits that mirror
`pluginLimits()` in the app (an item over a limit is refused with a warning, never cut). Cached by mtime, re-read on every
`serveIndex`, injected as `#squad-plugins` (content of active plugins only); `GET /api/plugins` (every plugin: content summary
without image data, `hasCode`, `status` and the state of its code, plus `config` and `restartRequired`), `plugins` in `/api/health`.
The same `squad-plugin.json` may also carry code (`server`), see "Plugins and adapter registry" below. In `app.js`,
`readPlugins`/`mergePluginCatalog` (souls, avatars, `TEMPLATE_AVATARS`, DIRETRIZES without overwriting, `Object.hasOwn` on every
plugin key) run before the seed, `pluginRuntime` feeds `DEFAULT_RUNTIME` (existing workspaces only get keys they lack), and
`mergePluginPresets` runs right before `AGENT_PRESETS.op` (name clashes, unknown roles and slot/role mismatches are skipped with a
warning). Themes: `settings.theme` (`'<plugin>/<key>'`, `''` = default); `city.js` builds the scene before `app.js` finishes, so it
calls the hoisted `squadThemeBoot()`, which resolves the theme with `bootChoice()` (the same workspace decision the boot uses)
and sets CSS variables + `window.SQUAD_THEME`; `setTheme` reloads only once the change is persisted. Configurações > Plugins
lists plugins, warnings and the theme picker. Without the tag (demo, upstream) the app behaves exactly as without plugins.

**Perfis and Adapters (contract in `docs/plans/perfis-adapters.md`, ADRs in `docs/adr/`, glossary in `CONTEXT.md`).** Every run
goes through a Perfil (row in `profiles`, outside the workspace): an instance of an Adapter (`claude`, or `codex` via `codex exec
--json`, whose events the bridge translates to Claude's stream-json) with its own executable and account folder (`CLAUDE_CONFIG_DIR`
/ `CODEX_HOME`), model/effort defaults, concurrency cap and Perfil reserva. Agents keep only `profileId`; `settings.runtime.
forceProfileId` overrides them. Codex colleagues are called through the bridge's own MCP endpoint (`/mcp`, per-run token). Usage
(tokens per run, `usage_daily`, 5h/7d windows) feeds Configurações > Perfis and the Painel. Perfis can also be declared in the
local config (`profiles`/`defaultProfile`): synced as `cfg-<key>` rows (removed when they leave the file, usage kept by
id), and runs wait for a pending sync before picking a Perfil. Editing, deleting or making default a config Perfil from the UI writes
back to the file that declared it (highest precedence; one `configOp` queue, hash re-check, `.bak`, temp + rename, mode kept); an
invalid item only freezes that Perfil. Config, plugin manifest and agent frontmatter are validated by `schemas/*.schema.json` through
`schema.js` (dependency-free subset of JSON Schema; a test keeps schema patterns/enums equal to the code constants).

**`src/app.js` (state, UI, orchestration).**
- One persisted `state` object (localStorage key `squad-code.network.v2`, export/import as JSON). Served by the bridge, the database
  copy is the truth (`diskSync`): the boot block takes `#squad-disk` unless the browser copy has pending saves on that same rev
  (`STORE_DISK` = `{rev, pending}` per origin); both changed or a never-synced browser copy that differs: the newer `wsActivity` wins and
  the other becomes a saved version. `save()` writes localStorage and queues `diskFlush` (250 ms, one PUT at a time, skipped when equal
  to `diskSync.last`; a version loaded from the database counts as saved, so opening a tab never writes). 409 → `diskConflict`: during
  a run this page forces its data, otherwise it backs up its JSON and `adoptDisk`s; `diskRefresh` (focus/visible, idle only) adopts what
  other tabs saved. Bridge down or old token: changes stay in the browser (`#storageState` says so) and reach the database on the next
  load. Configurações > Workspace lists the saved versions (`loadVersions`, **Restaurar** → `restoreVersion`); import and restore share
  `restoreWorkspace`, which first saves the current workspace as a version. Log and handoff ids survive normalization (`keepId`) and
  `log()`/output pushes use the normalized key order, so the row diff does not churn after a reload.
  First start (`#squad-disk.setup`): `diskSync.setup` keeps `diskSync.on` false and makes `save()` a no-op (the browser copy stays in
  `diskSync.localCopy`, untouched); the boot shows the example behind `openDbSetup`, a modal (kind `db-setup`, no close button,
  `closeModal` refuses it, so Esc does nothing) with the database path, the Claude status (`dbSetupStatusHTML`, refreshed by
  `checkBridge`) and four starts: **Começar do zero** (`#dbSetupForm` → `dbSetupFresh` → `freshWorkspace(name)`: the seed's agents and
  squad with one blank OP-001 built like `createOperation`, then the operation page), **Carregar exemplo** (`seedWorkspace`), **Importar
  backup** (`#dbSetupImport`) and **Recuperar a cópia deste navegador**. All go through `dbSetupCreate` (normalize + `migrateCatalogAgents`,
  `POST /api/setup`, then `diskSync.on`; an unpicked browser copy becomes a version; 409 reloads the page).
  `normalizeWorkspace` rebuilds it field by field from a whitelist: **a new persisted field must be
  added there (and to `seedWorkspace`), or it is dropped on reload/import.** Transient UI state lives
  in `ui`.
- `render()` is the central re-render. Full pages (`home`, `projects`, `squads`) render through
  `opsBlock(id, signature, html)`: a block's innerHTML is replaced only when its JSON signature changes,
  so background renders (runner ticks, logs) don't wipe inputs the user is typing in. Keep signatures
  free of values the user is editing.
- Interaction is delegated: one document `click` dispatcher switches on `data-action` (the element's
  `data-id` arrives as `agentId`), and a `submit` map routes by form id (`#agentForm → saveAgent`,
  `#projectForm → saveProject`, `#squadForm`, …).
- Modals: `showModal`/`closeModal` (`ui.modal`, `ui.draft`). The agent studio is a modal with tabs
  (`editorTab`). `confirmAction` itself opens a modal and replaces the current one — don't call it
  from inside the agent studio.
- Views (`ui.view`): `home` (Painel), `projects` (operations: briefing + features, all in-page),
  `network` (Squad map), `handoffs`, `squads` (Squad Studio, reached from Painel/HUD/key `G`). Agent Teams (the kickoff meetup,
  below) is a full-screen modal opened from the operation's briefing or from a Painel card.
  The SQUAD tab (nav button, Painel "Abrir rede do squad", Q/E) goes through `openSquadView`: with more than one operation and no
  run it asks whose squad to show (modal kind `op-pick`, `squad-view-op` → `squadViewOp` = `homeSwitch` + `goView('network')`);
  entry points that already name the operation ("Abrir no squad", agent links) go straight to the map.
  Painel project cards (`homeProjectCard`) have **Abrir projeto** (`home-open-project`) and **Abrir times** (`home-open-teams` →
  `homeOpenTeams`: switches project, opens the operation page and `openAgentTeams`; without `liveMode()` it only shows the warning).
  Entering the Squad Studio or showing another squad (`ui.sqShown`, reset when the view changes) plays `sqBuild` once: the
  command tree draws itself (trunk with a spark, band lines, labels, buses, stubs, nodes), timed from the real layout through
  CSS custom properties under `.sq-build`, which is dropped at the end so the ambient pulses resume. Re-renders never replay it.
- Chats: the feature editor's co-writing chat (`ui.featureChat`, `runCoWrite`) and the agent chat (`ui.agentChat`,
  modal kind `agent-chat`, opened by `openAgentChat` on a double click on an agent in the `network` view; a single click selects) share one engine
  and the same DOM ids (`#feMsgs`, `#feChatInput`): generic helpers read `chatNow()` and branch on the chat's `kind`.
  The agent chat offers `AGENT_CHAT_MENUS` per `chatFamily` (commander/adr/prd/op), handled by `agentChatAct`; free
  talk is `runAgentChat` (bridge, no tools). Conversations are kept in `ui.featureChats`/`ui.agentChats`/`ui.docChats` (filled at boot
  from `#squad-memory.chats`): `chatStash` (the Stop functions) stores `chatSnapshot(c)` there, and with the bridge `chatPersist`
  (hooked in `chatPush`/`chatSettle`/`chatFooter`, 800 ms) and `chatFlush` (beacon on `pagehide`) save it to the database.
  Every chat turn runs with `CHAT_RUN` over `runOptionsFor` (`tools:[]`, `permissionMode:'dontAsk'`, `partial:true`); never
  `plan` (its planning flow made replies slow and the model wrote fake tool calls). `claude -p` never offers AskUserQuestion, so
  an agent asks with `"ask":{question,options}` in the reply's ```json block (`COWRITE_SYSTEM`/`AGENT_CHAT_SYSTEM`): `chatAsk`
  turns it into `id:'ask'` buttons (`agentChatChoose` sends the pick back as the person's message; typing also answers).
  `chatStream` grows one live bubble from the text deltas (hidden from ```json on) and `chatSettle` fills it at the end.
  Both chat headers show the effective model (`coWriterModel`) and an effort chip (`effortChipHTML`: 5-bar meter; the model's
  default, dashed, when no level is set; none for Haiku), following the same override rules as `runOptionsFor`/`agentEffort`.
- **Agent Teams** is how the first data of an operation is co-written: an online meetup, Teams style, in a full-screen modal
  (kind `teams`, size `agent-teams`, `openAgentTeams`, only with the bridge: without `liveMode()` it toasts and does not open, there
  is no demo of it). The chat is the third co-writing kind, `doc` (`ui.docChat`, memory `ui.docChats`), on the single document
  `PROJECT_DOCS.kickoff`: briefing, visão, escopo dentro/fora, glossário, arquitetura and ADRs, each field with an `owner`
  (`chatFamily`: commander writes the briefing, PRD vision/scope/glossary, ADR architecture + ADRs; `docOwner` gives an empty seat's
  fields to the commander). `docAgents` reads the squad selected in `#projectForm`; the meeting is a group chat (`c.group` =
  commander, PRD, ADR). The commander conducts: `docTurnCrew` opens a round with the agents the person tags with @ (`@CODENAME` or
  `@comandante`/`@prd`/`@adr`/`@arquiteto`, `teamsMentions`; a name without @ does not route), else whoever asked the pending
  `ask`, else the commander; any reply can pass the word with `"next":"CODENAME"` (`applyDocWrite` → `meta.out.next`), queued in
  the same round, at most `TEAMS_ROUND` (3) turns. Agents cite each other as @CODENAME (system prompt), but only `next` hands
  over the floor. `teamsMentionHTML` turns participants' mentions into `.at-mention` chips in the bubbles (rendered, greeting and
  live; never inside code); a chip or a camera tile (`data-action="teams-mention"`) tags that agent in the composer. Typing `@`
  opens `#atMention` (`teamsMentionMenu`, a window capture keydown takes ↑/↓/Enter/Tab/Esc before the send and leave handlers),
  and `#atTo` ("Para:") shows who will answer. Guests: squad members outside the meeting (`teamsPool`: the squad's seats minus
  `c.group`, at most `TEAMS_GUESTS` at a time) are called in by a host's `"invite":[{agent, reason}]` (`applyDocWrite` →
  `meta.out.invite`, at most 2 per reply) or by the person's `@CODENAME` (`teamsMentionsPool` in `docTurnCrew`). `teamsJoin` adds
  them to `c.group` and `c.guests` (`{by, reason, waiting}`), posts a system note and a camera (`teamsAddTile`, `.guest`, its CRT
  started in step through `--crt-t` from `ui.teamsT0`), and they speak right after the caller (`crew.splice`, the round limit
  grows). A guest gets its own system prompt (called by whom and why, no document fields, only `ask`; `applyDocWrite` ignores its
  fields/next/invite) and leaves once it delivers (`teamsGuestOut`, note + fade); if it asked, it waits (`waiting`), answers the
  pick and leaves. Leftover guests leave at the end of the round, and all of them on close (`docChatStop`; `closeModal` then plays the CRT power-off on an inert ghost of the overlay, `teamsPowerOff`, none with reduced motion); `c.hosts` keeps the
  three fixed participants. The `@` list has a "Convidar" group; the gallery grows to 3/4 columns (`data-n`, `--n`). Each turn is its own `claude -p` (own instructions,
  SOUL, model, effort) and sees the round so far ("Nesta rodada") and the agenda ("## Pauta", `teamsAgenda`, same rule as
  `projectGaps`); `docCoWriteSystem` tells each agent to write only its fields. Screen: top bar (clock `teamsTick`, from `ui.teamsT0`, so it restarts on every open, agenda chips,
  tabs Chat/Documentos, save, Sair), stage with one tile per agent plus Você (`data-state` from `c.speakerId` + `c.phase`:
  thinking → speaking (first streamed words, `chatStream` `onFirst`) → sharing; every tile has a CRT overlay in its
  `:before`/`:after`, under the labels, all cameras in sync (no per-tile delay and no state may swap those animations), and
  agent tiles show the writing balloon `.at-tile-typing` in the bottom-right corner while their state is not idle), the bar
  `#atSplit` that resizes the chat (`teamsSplitDrag` with pointer capture, ←/→, Home/End, double click resets; `--at-side`,
  persisted as `state.settings.teamsChat`, 0 = default, in `normalizeWorkspace`; hidden under 900px), and the shared screen: `chatApply` calls
  `teamsShow` for every field written (`c.sharing`, block reveal, 1.5 s per field), back to the gallery on the next round or
  "Voltar à galeria". `teamsSync` (no-op outside the meetup) keeps tiles, chips and counters in step. The chat keeps the engine's
  DOM ids (`#feMsgs`, `#feChatInput`) in a Teams skin (`.at-chat`; sender with time, `feSenderFor`, `chatWho`, tails per
  `data-who`; `chatAgent` returns `c.speakerId`); the Documentos tab holds `#docForm` + `#docAdrList`, so `setFeField`,
  `applyDocAdrs` and `undoCoWrite` work as in the editors. After the greetings `teamsOpening` (scripted) presents the agenda by
  what is missing. Sair or Esc with unsaved documents (`teamsDirty`, snapshot at open) asks in the bar (`#atConfirm`; never
  `confirmAction`, it would replace the modal). Entry points: the Agent Teams button in the briefing section head (`teamsCtaHTML`)
  and the portraits on the briefing label and the DOCUMENTAÇÃO rows (`DOC_ROWS` → `kickoff`, `data-action="agent-teams"`,
  `preventDefault`ed inside `<summary>`), all refreshed by `refreshDocAgents` when the squad changes. It starts from the page
  form's current values; "Salvar no projeto" (`#docForm` → `saveProjectDoc`) writes back into `#projectForm`, calls `saveProject`
  (a new operation only fills the form: "Aplicar ao formulário") and opens and highlights every page place.

**Domain model.**
- Positions (`a.hex`, `a.desk`) are unique per squad, not per workspace: `takenHexes`/`takenDesks` only look at `squad()`
  (the active squad), the map gets no other agents, loading only fixes invalid positions, and `render()` runs
  `resolveSlots(team)` so an agent that joins a squad on a used spot moves to the nearest free one.
- Squad = `{name, commanderId, adrId, prdId, operatorIds}`: exactly one commander (role `commander`),
  one ADR (`architect`) and one PRD (`po`) reconhecedor, ≥1 operator (`squadMissing`/`slotFits`).
  A double click on a free hex/desk (`onCreateAt`) opens the studio with `squadId` (`ui.draft.squadId`); `saveAgent`
  puts that new agent into the squad (`squadJoinSlot`/`squadJoin`: operator, the ADR/PRD seat if it is free, a second
  commander is refused) and into an open Squad Studio draft of it. "Novo agente" (key `A`) still creates it outside squads.
- **Nova operação** (`project-new` → `openProjectEditor()` → `openOpNew`) is a two-step wizard in a modal (kind `op-new`, `ui.opNew`):
  the name (`#opNewForm` → `opNewNext`), then an existing squad (`op-new-existing` → `#opNewSquadForm` with `squadPickerHTML` →
  `opNewCreate`) or a new one (`op-new-squad` → `opNewNewSquad`: `ui.opPending={name}` + `newSquad()`; the Studio tags the draft and
  `saveSquad` creates the operation with the new squad; cancelling, picking another squad or leaving the Studio drops `ui.opPending`).
  `createOperation` creates and persists it at once (`blankProject`, folder, "Sprint 01", empty briefing); the briefing is not
  required by `saveProject`, `projectGaps`/`runGate` block runs until it is filled. The older inline draft (`ui.opsNew`, the
  `creating` branches of the projects page) no longer has an entry point.
- A project/operation references exactly one `squadId` (required in `saveProject`; `deleteSquad` refuses a
  squad in use); `project.agentIds`/`commanderId` are **derived mirrors** kept by `applySquad`/`syncSquad` —
  change membership through the squad, not the project. Projects also carry documentation fields (`vision`,
  `scopeIn`, `scopeOut`, `glossary`, `architecture`, `adrs[]`) and features carry `tasks`.
- Project folder: `project.folder` (persisted, `projectFolderName` = `<code>-<name>` slug, unique; `normalizeWorkspace` derives it
  for older backups) is set once by `createOperation` at creation and never follows a rename; deleting the project keeps the folder on
  disk. `runOptionsFor(a,r,p)` sends it as `project`, so live steps and chats run in `projects/<folder>` (`projectDirLabel` shows
  it). There is no global working directory: the runtime has no `cwd` field.
- Sprints: `project.sprints` (ordered `{id,name,goal}`, ≥1, max 50) and `feature.sprintId`: every feature is in exactly one
  sprint (`sprintOf`, `sprintFeatures`); `normalizeWorkspace` creates "Sprint 01" for backups without sprints and sends orphans
  to the first. The list view renders sprints as accordions, collapsed by default (`ui.sprintOpen`), with a cube SVG
  (`sprintCubeSVG`) rooting a tree of `.sprint-node` rows (trunk and branches are the node's pseudo-elements, the dot takes the
  status color); `setSprintOpen` opens one and plays `.drawing` once (`ui.sprintDraw`: cube, trunk with a spark, branches,
  rows), which re-renders never replay. Dragging a row onto
  another sprint (`moveFeatureToSprint`) keeps route and status, the editor's SPRINT select goes through `saveFeature` (resets
  the route). `currentSprint` = first sprint with a feature not done.
- Project setup: every operation's first feature is **F00 Setup do projeto** (`feature.setup === true`, scope `setup` → architect,
  backend, frontend, qa; `SETUP_FEATURE`, `SETUP_BRIEF`). `ensureSetup(p)` keeps it first in `p.features`, in the first sprint, with
  no dependencies, and puts it in every other feature's `dependencies` (ready ones become blocked until it is done), so nothing else
  runs before it is approved. It runs in `createOperation`, `saveProject`, `saveFeature` and `normalizeWorkspace` (older workspaces
  get it in backlog; the boot then writes the database at once, `diskSync.migrated`). It cannot be deleted, dragged or moved to another
  sprint; the editor locks its sprint and shows it as a fixed dependency of new features (`featureDraftFor`). The seed's F00 is done.
- **Exportar** (operation header) → `exportProject`/`projectExportFiles`: a store-only `.zip` (`zipFiles`) with
  `CLAUDE.md`, `docs/{project,architecture,standards,features/<NNN-slug>}` and `.claude/{agents,commands,settings.json}`.
  `docs/standards` is compiled from the squad's DIRETRIZES (`STANDARD_FILES`); simulated-only progress exports as
  `backlog`. The DIRETRIZES catalog paths (ADR/PRD/C4) follow the same `docs/` layout.
- Features carry `route` (ordered agent ids) built by `routeFor`, which maps scopes to roles with
  `ROLE_FAMILY` (e.g. node/java/dotnet cover the backend step). A finished route sends the feature to
  human review; only approval marks it done and unblocks dependents.
- Agents: `ROLES` defines specialties; Squad Studio presets come from `AGENT_PRESETS` and
  `OP_CATEGORIES` (operators picked by category → sub-specialty, generalist first) and are
  materialized by `createPresetAgent`. Each agent has `model` (catalog `CLAUDE_MODELS`: aliases, pinned IDs, `inherit`;
  any id valid for the bridge survives import) and `effort` (`EFFORTS`, `''` = model default; none for Haiku,
  `modelEffortSupport`). The global runtime model/effort override the agent's (`runOptionsFor` → `agentEffort`); both go
  to the exported `.claude/agents/*.md` frontmatter (`agentMarkdown`) and to the CLAUDE.md command-chain table.
- SOUL: `src/souls.js` (`AGENT_SOULS` per catalog codename + `GENERIC_SOUL`) gives each agent `soul`/`hellos` (greeting variations, one picked at random per chat)
  (`defaultSoul`); it shapes the chat tone and greeting (`soulBlock`, `feGreeting`) and is exported (`soulMarkdown`).
  Tone rules for every agent chat: human, no catchphrases, no dashes (`soulBlock`, `AGENT_CHAT_SYSTEM`, `COWRITE_SYSTEM`), and
  `chatClean` strips dashes from reply bubbles. Changing a catalog soul/greeting list: keep the earlier version's `soulHash` /
  `helloPrint` fingerprint in `SOUL_PREV` / `SOUL_HELLOS_PREV` so unedited agents migrate (`normalizeSoul`, `normalizeHellos`).
- Diretrizes (conventions): catalog in `src/conventions.js` (`CONVENTION_FAMILIES` with ≥4 base
  templates per agent type, `CONVENTION_SUBSETS` grouped by `CONVENTION_GROUPS`); each agent stores
  `conventions = {family, template, base, subsets[]}`; `conventionFamilyOf(agent)` ties the guide to
  the agent's role/specialty.
- Coding style lives in the DIRETRIZES, never in a system prompt: group `style` ("Estilo de código") holds one `style-<lang>`
  subset per language (ts, js, python, go, java, csharp, php, kotlin, swift, dart, sql, css, shell, yaml, hcl).
  `CONV_STYLE_SUGGEST` (conventions.js) maps family → style subsets (shown first in the picker); `codeStyleKeys(a)` refines it
  by specialty, and `defaultConventions` gives them to every catalog/new agent (plus the preset's own `conv.subsets`).
  `docs/standards/coding-style.md` exports the `style` group.
- Catalog prompts (`ROLES[*].prompt`, preset `style`, the `presetPrompt` specialty suffix) are Portuguese and describe the role
  only. `migrateCatalogAgents` (a top-level call after the catalog, since `normalizeWorkspace` runs before `AGENT_PRESETS` exists;
  also on import) moves prompts still equal to an earlier catalog version (`PROMPT_PREV`: `soulHash` → `role:`/`preset:`) to the
  current text, and once per workspace (`settings.catalogVersion` < 2, persisted) adds the stack's style subsets to unedited
  DIRETRIZES (catalog base guide + only the preset's own subsets). Changing a catalog prompt: add its previous fingerprints to
  `PROMPT_PREV`; a new one-time migration bumps `catalogVersion`.

**Execution path.** `startRun` → `launchNext` → `simulationStep` (demo) or `liveStep` →
`executeLiveStep`, which POSTs `{prompt: buildStepPrompt(...), systemPrompt: agentSystemPrompt(a),
options: runOptionsFor(a)}` to the bridge. `agentSystemPrompt` = agent instructions + its conventions
guide; use it (not `a.prompt`) anywhere the agent's instructions leave the app (live runs, command
preview, `.md` export). Each step's output becomes handoff context for the next agent.
Runs are scoped: `startRun({sprintId})` runs a sprint, `startRun()` the `currentSprint` (action `run`, space key, HUD, Painel,
commander chat), `startRun({featureId})` one feature with its full route (`startFeatureRun`, `runner.single`, `kind:'feature'`).
Nothing runs on an incomplete project: `runGate` (`projectGaps`: every saved field of the project form and documentation, a squad,
≥1 ADR and each ADR with title and content) is checked by `startRun` (after the pause/resume toggle), `openSpawn`, `spawnAgent`
and the commander chat `run`. It lists what is missing in a toast and in the `.ops-run-gate` notice, then opens the briefing. The seed
project is complete so the demo still runs.
**Commander, operation room and calls.** Every run is planned by the squad's commander before anything executes. `runner.phase`
goes `planning` → `awaiting` → `running` (`runControl()` gives the run buttons their label: Planejando / Aprovar plano / Pausar /
Retomar; `launchNext`/`scheduleStep` only move in `running`):
- `beginPlan` opens the room and runs `planWithCommander` over the scope's pending features (backlog/ready/blocked). Live: one
  `claude -p` of the commander (`CHAT_RUN`, `COMMANDER_PLAN_SYSTEM`, `commanderPlanPrompt` with `routeFor` suggestions) streams its
  message and ends with ```json `{"plan":[{feature,route:[CODENAMES],briefs:{CODENAME:text}}]}` (a bare object is accepted too);
  `validatePlan` keeps squad members only (never the commander) and falls back to `routeFor` per feature, or wholly with a note.
  Demo: `routeFor` + `defaultBrief`.
- The plan card waits for the person: **Executar plano** (`roomApprove`, also the run button/space key while `awaiting`) writes
  `f.route` + `f.briefs` (persisted, aligned with the route, reset wherever the route changes) and starts; **Cancelar** is `stopRun`,
  which leaves every feature untouched (and cancels `runner.planRunId`).
- The room (`ui.rooms[projectId]`, max 800 messages) is a group chat shown in the **operation chat** (`openOpsChat`, no modal): any run
  start (`beginPlan`, `spawnAgent`), the `room` action and the War Room take the person to the Squad map in the isometric office
  (`settings.squadView='office'`, `goView('network')`), where `#opsChat` (shell) takes the left HUD's place (`#workspace.ops-chat-on`
  hides the roster with Novo agente/Briefing/Squad Studio and the bottom strip's agent/briefing buttons). `ui.opsChat`
  `{open, min, unread, pid}` is transient; `renderOpsChat` (in `render()`) shows it only on `network` and `opsChatBuild` fills it once per
  project with the room's ids (`#roomStatus`, `#roomCrew`, `#roomFeed`, `#roomControls`), so `roomFeedEl`/`roomChrome` write there.
  WhatsApp skin (`.ops-chat` restyles `.room-*`), minimizable to `#opsChatMini` (last message, unread count from `roomPush`),
  closable (`opsChatClose`) only with no run, so after a run it stays with the summary until closed. It takes the whole left side,
  over the top bar too (z-index above it, its header as tall as `--topbar-h`; `.ops-chat-dock` puts the top bar's tabs and status in
  the space to its right and leaves the brand under it): width `state.settings.opsChat` (px, 0 = 380, in `normalizeWorkspace`) as `--oc-w` on `#workspace`
  (`.ops-chat-dock` moves the bottom strip aside), resized by `#ocSplit` (`opsChatSplitDrag`/`opsChatSplitKey`, double click resets,
  `opsChatSideSet`; `opsChatLimits`: 300 px up to half the window or 720, leaving the top bar room for its tabs and status); `renderOpsChat` runs before `MapNetwork.setMode` in `render()` and calls `MapNetwork.setInset(opsChatDockW())`, so
  the map (and a morph to the office) frames the free area. Minimized or ≤900px (bottom sheet) there is no dock. With the bridge it is saved:
  `roomOf` hydrates a project's room once from `#squad-memory` (`roomHydrate`: pending plan and open calls end cancelled, `seq` = max id,
  before the first render so the office does not replay errands), and `roomPush`/`roomUpdate`/`roomRemove` queue changes (`roomQueue`,
  owner per message in `roomOwner`, `roomFlush` 600 ms, beacon on `pagehide`). It shows
  `roomPush`/`roomUpdate` (rAF batched)/`roomRemove`, `roomTyping` (never saved), crew column (`roomCrewHTML`: com o bastão, chamado, na fila,
  entregou) and `roomChrome()` (called at the end of `render()`). Message kinds: `system`, `say` (`activity[]` chips, `thread`,
  `human`, `error`), `plan`, `call`, `baton`, `review`. `roomStepStart` (agent says its part), baton cards in `advanceRoute`, review
  card + commander summary in `launchNext`. Demo work and calls come from `SIM_WORK`/`SIM_CALL` as beats (`simBeats` kept in
  `runner.sim`, played by `simBeat`: first chip, call open (`roomCalling`) and answered, other chips, summary). Nobody watching the
  office (`officeLive()`): `simulationStep` plays them all in one tick (same timing as before); watched: one beat per
  `scheduleStep(cb, ms)`, and in the demo `scheduleStep` also waits (at most 9 s) for `officeSettled()` so the walks complete.
- Live steps use `stepRunOptions(a,p)` = `runOptionsFor` + `agents` from `squadSubagents` (every other squad member keyed by
  `agentSlug`, own prompt + `CALLED_AGENT_SYSTEM`, tools, model, effort; no `Agent`, so no nesting) + `forwardSubagents`, and add
  `Agent` to `tools`/`allowedTools`. `buildStepPrompt` adds the commander's instruction and the colleagues list. `roomEvent` maps
  the stream: text → bubbles, tool_use → chips (`toolActivity`), `Agent` → call card (`roomCalling`), subagent messages
  (`parent_tool_use_id`) → thread, tool_result → the card's answer. Chats never get agents.
- Individual spawn (`spawnAgent`, `kind:'spawn'`) skips the commander but runs in the room too.
"Distribuir features" (`openDistribution`, deterministic `routeFor` plan, `applyPlan`) still exists for planning by hand, and
`launchNext` only picks features of `runner.sprintId`. The export orders features sprint by sprint,
adds `sprint:` to each `spec.md`, a Sprints section to `scope.md` and `/executar-sprint`.

**Plugins and adapter registry.** Engines live in `adapters/`: `adapters/index.js` exports `createRegistry(host)` (a factory, one per start, not a module singleton) that loads the built-ins `claude.js` and `codex.js`; each is `module.exports = host => adapter` with `kind, label, efforts, genAiSystem, colleagues, defaultBin, notFound, catalog, resolveModelEffort, prepare, finish, refreshWindows` and optional `home, profileExtras, status, validateProfile, validateLaunch, nativeTelemetry, onEvent, settingsFile`. `validateAdapter` checks the shape; `register(impl, {override, source, env})` returns an undo; `builtinKinds()` lists what shipped. `server.js` only asks the registry (lookups, `prepare`, `finish`, `onEvent`, `recordWindows`, `refreshWindows`, `engines`, catalog); no engine name is hard-coded there. A plugin is one folder with one `squad-plugin.json` (schema `schemas/squad-plugin.schema.json`) bringing content, code (`server`) or both; there is no separate kind of plugin. `plugins.js` discovers all of them in `load()` (`plugins.paths` of each config file, relative to it, `SQUAD_PLUGINS` and `<home>/.squad-code/plugins/<id>/`; local sources first, deduplicated by realpath; at most 20) and returns `discovery` for the host; `orderPlugins` (Kahn, a cycle disables its members, fail-closed) decides the order. `plugin-host.js` (`createPluginHost`) imports code only inside the `listen` callback (`import()`, `register(ctx)` with 10 s each and a 30 s total budget, `SQUAD_PLUGIN_*` overrides for tests; `register` is never called after the import timed out); `pluginHost.ready` is awaited by `handle()` after `tokenOk`, `serveIndex`, `startRun` and `afterOpen`. Only the local config (`squad.local.json`, `SQUAD_CONFIG`, `SQUAD_PLUGINS`, the home folder) can run code: a `server` plugin found only through `squad.config.json` is `blocked`, and `enabled`, `entries` (`grants`, `settings`, `failClosed`), `hookTimeoutMs` and a `disabled` of a code plugin only count from the local file; `runtime.permissionMode`/`addDirs`/`extraAllowedTools` from a shared source are ignored with a warning. The content of a plugin with code is read only when it is in `enabled` and reaches the page only while its code is `active` (`selectContent`); a plugin without code whose `requires` failed to load is `disabled` and leaves it too (`contentBlocked`). `plugins.entries.<id>.grants` must cover the capabilities the manifest asks for (`run.mutate`, `adapter`, `adapter.override`, `run.content`, `workspace.read`), otherwise the plugin is `denied`. `ctx` is frozen after `register`: `id, apiVersion, log, settings()` (validated before import, 16 KB), `dataDir()` (lazy, `<DATA_DIR>/plugins/<id>/`), `secret(name)` (declared `env` only), `onDispose`, `hasCapability`, `use(id)` (declared `requires` only), `http`, `registerRoute` (under `/api/plugins/<id>/`, same token/Host/Origin as the core; object → JSON, `{status, body}`, a plain throw → generic 500), `on(event, fn, {partial})` and `registerAdapter(kind, impl)`. Events (`run:start`, `run:event`, `run:finish`, `profile:usage`, `workspace:saved`) go to a per-plugin queue (1000, `setImmediate`, `run:event` dropped first, then the oldest), 3 s per handler (`hookTimeoutMs`), a breaker after 20 straight failures per handler; without `run.content` a plugin gets a whitelist projection (`projectRunEvent`, `stripFinish`), never prompt, text, input, content, stderr or cwd; `emit` with no subscriber is an `if`. `run:beforeSpawn` (`run.mutate`) runs in `launchRun` after the synchronous slot reservation (`admitBump`) and before `prepare`: `{block}` is a 403 that returns the slot, `{appendSystem}` (20k per plugin) is appended and the 100k cut is reapplied on the base (with a `bridge/plugin` event); fail-open unless `plugins.entries.<id>.failClosed`; 5 s budget for all handlers; only the bridge's own usage probe (`internal.exact`) skips it, never a `meta.kind` sent by the API. `registerAdapter` needs `adapter`; replacing `claude`/`codex` also needs `adapter.override` and only the built-in can be replaced; a plugin adapter runs (and is probed with `--version`) with a minimal env (`MIN_ENV_RE` plus its declared `env`), `nativeTelemetry` is never called for it, and it receives a restricted run view (no `parent`, `events`, `files`, `child`). `GET /api/plugins` shows status (`active`, `data`, `disabled`, `error`, `denied`, `invalid`, `blocked`), capabilities and observers; `restartRequired` follows the code (hash of the `server` file, manifest fields, `enabled`/`entries`); `/api/health` counts active plugins and reports `adapterSources`. Rule: core changes go through extension points; company code and content go in plugins, never in `server.js`, `adapters/` or the app. Tests: `tests/adapters.test.mjs` (registry, pure adapter functions, the translator against ADR 0001, and `tests/golden-argv.json`, the argv and env of 7 runs generated before the registry, compared with normalized paths and port); `tests/plugins.test.mjs` (single manifest schema, discovery, loading, routes, events, `beforeSpawn`, `registerAdapter`, `denied`, using `tests/fixtures/plugins/*` such as `hello`, `content-only`, `code-and-content`, `event-log`, `policy`, `fake-adapter`, `no-grant`); test ports: plugins 4700-4714, adapters 4800-4949; the files run one at a time (`--test-concurrency=1`). `docs/plans/plugins.md` "Desvios" is the record of what differed from the plan.

**`src/city.js` (`MapNetwork`).** Three.js scene with two views sharing the same agents: a hexagonal
city (perspective camera) and an isometric office with desks (orthographic). HTML markers/cards are
projected over the canvas (`updatePositions`, which places `[data-node]`, `[data-anchor]` and `[data-pin]` elements);
office agent cards are laid out to avoid overlap. The selected agent's quick-action bubbles (`nodeActionsHTML`,
`.node-actions[data-pin]`) are ignored by the map's pointer handling and are an obstacle for the card layout (`ACT_SPOTS`, same offsets as the CSS).
Move mode (`startMove`/`cancelMove`/`isMoving`, bubble Deslocar): the next click on a free hex/desk calls `onPosition`, with
a preview through `dragHexOf`/`deskOf`, a banner (`.map-move-hint`) and a cursor tip (`.map-move-tip`). The
A docked left panel (the operation chat) is `setInset(px)`: `insetShift()` (what it covers beyond `LEFT_ROOM`, halved) is added to
both cameras' `setViewOffset` and to the 2D fallback, `homePose` frames the remaining width, and the zoom follows that framing
(measured before/after on the current view), so the canvas is never resized while docking or dragging. The bottom map legend is one
compact `.legend-strip` (map controls, `.legend-sep`, agent/briefing/features/help). The
app talks to it through `MapNetwork.set(...)`, `setMode`, `onPosition`, `onEmptyClick`, `onCreateAt`,
`rotate`, `home`. Without WebGL it falls back to a 2D projection using the same camera math. `setMode` switches
views with a cinematic transmorph (`morph`, one 1.2 s tween `morphRun`, swap at `MORPH_SPLIT`): the camera orbits its target
around its right axis (`pose.flip`, applied in `applyCamera` via `orbit`, so lights/projection/picking stay consistent) while
it swings in theta, so the world tips over and spins until edge-on, and the other view arrives from the far side. The agents'
icons fly between the views as ghost clones (`.map-morph-ghosts`, destinations measured with `homePose`/`measureHome`,
blended into the live `agentPoint` at the end); office cards collapse on the way out (`lastCards`, kept by `layoutCards`)
and pop in on landing (`morph-land`, `--i`). Back in the city the buildings resurge in a wave (`sinkCity`/`riseCity`, a
`rise` multiplier per `byHex` group, independent from `k`) after the map is usable again. `.map-morphing` hides the real
markers with `visibility` and blocks the pointer; `zoom`/`rotate`/`focus`/public `home` return while morphing, a toggle
during it is queued, and `finishMorph` ends it at once (pause behind the Painel, reduced motion, resize). The office is built
and its shaders compiled at idle after boot (`gl.prepareOffice`, plus `ensureMorphLayers`), and the frame loop pauses tweens
across long frames instead of letting them skip.
Planet mode (setting `cityShape` 'flat'|'planet', passed in `MapNetwork.set`): the city scene keeps its flat coordinates and
`bendTree` patches every city material once (`bendMaterial`, `onBeforeCompile`, identity at b = 0) so the vertex shader maps
the flat world onto a sphere (`pl_map`, azimuthal equidistant, blend `planet.b` 0..1 curls it; `pl_bend` turns normals) and
disables frustum culling; objects tagged `userData.noBend` (core sphere, stars, halo, south-pole beacon in `planetFx`) are
skipped. `planetMap`/`planetUnmap` mirror it in JS for projection (far side = `behind`), picking (ray/sphere) and the camera,
which is the flat pose carried rigidly by the surface at the focus (`carryQ`, lights turn with it). `setShape` animates the
curl (`CURL_MS`, staged: pulse from the squad, camera first and the bend lagging it, a theta swing and a distance breath, and
`gl.foldWave` running a hologram band over the buildings; a toggle mid-way reverses from the current state; `curling` blocks
picking and camera input, `finishCurl`); `homePose` branches on the setting. The side controls' `.shape-toggle`
(`data-action="city-shape"`, key `P`, `aria-pressed`) flips `settings.cityShape`; render() collapses it (`.off`) in the office
view and without WebGL and plays `.folding`/`.unfolding` on its icon. Side-control icons are the `map-*` keys of `ICONS`. New city materials need
nothing special, but anything placed far from the ground must be subdivided (`hexRing` seg) so chords follow the sphere.
`bendMaterial` chains a material's own `onBeforeCompile` and keys the program by `userData.shaderKey` (the buildings' facade).
The city look (dark monochrome island, after a local reference image in the git-ignored `.inspo/city.jpg`; palette `CITY`, while `C` serves the office and the agents' cyan
accents): one ground mesh shaped like the grid (each hex fan subdivided, at `TILE_H`, so picking is unchanged) carries the street
map (`cityMap`, a CanvasTexture drawn once: avenues on the hex borders, 3 rhombus blocks per hex, light kerb lines, parks, coast),
plus water and a seawall (flat shape only). Buildings are instanced parts per kind (`GEO`: box, prism, round, spire, tree, pine;
`{key, kind, x, z, rot, w, d, h0, h, tone}`, setbacks stack parts), grouped in `byHex`; `writeBuilding` scales each part with
`k * rise`, so free/occupied hexes and the rise wave keep working. Heights follow seeded value noise (`district`), capped near the
squad (towers only from ring 6); density is kept low on purpose (about 40% open lots, mostly one building per block, ~950 parts).
Agents' plazas stand out in electric blue (`AGENT_BLUE`; self-lit body, rim in HDR colour `rimColor()` so the bloom makes it
glow, an outer line and an additive light pool `poolTex`); handoffs keep purple rims. Links (`buildArcs`, both views) carry
transmission signals: a second additive tube with a clone of `signalTex` (bright head, fading tail) whose `offset.x` scrolls
from sender to receiver in `animate` (`packets` entries with `signal`), faster and brighter on the active link.
A plain click on a free hex sets `pickedHex` (outlined by `pickGroup`): `syncCity` counts it as busy, so its buildings go down and
only the ground stays; the same hex again, an agent's hex or a click outside the grid clears it (`MapNetwork.picked` for tests). The facade (floor lines, mullions, darker foot, lit cornice and roofs) is computed from the world
position in `buildMat`'s shader. The key light `sun` casts PCF shadows (r186 removed PCFSoft; softness is `shadow.radius`);
casters use the bent `customDepthMaterial` (`castShadows`). City post-processing (`buildComposer`, the office renders directly):
MSAA target → `GTAOPass` at half resolution (its normal material bent; transparent meshes and `userData.noAO` hidden from the
G-buffer) → subtle `UnrealBloomPass` → `OutputPass`. Shadows (`shadowMap.autoUpdate = false`) and AO are recomputed only when
`geoDirty` (`markDirty`: buildings, plazas, planet, quality, size) or the camera/sun moved (`sameAs`, number by number against
`camPrev`/`sunPrev`, no per-frame allocation); otherwise the cached AO is multiplied straight onto the frame (one pass, `needsSwap`
false). MSAA 2x (0 at dpr > 1.25), bloom at half resolution, ground anisotropy ≤ 4, GTAO 8 samples. Frame pacing (`frame()`,
`pacing`): with the camera still and motion on, ambient animations draw on every vsync ('full'); over 15% of drawn frames above
24 ms switches to 'half' (draw when ≥ 26 ms passed, a steady 30 fps); interaction and tweens always draw; `applyQuality`/`resize`
reset it (`MapNetwork.pacing`). Packets reuse their position vector (`curve.getPoint(k, target)`). Quality: `settings.mapQuality` ('high'|'low', toggle in Configurações) plus automatic degradation (`gl.measure`: average
over 45 ms per frame drops AO, then bloom, then shadows); `MapNetwork.quality` reports it. The Three bundle includes these
addons (`scripts/three-entry.js`).
The office (`OFFICE`/`ROOMS`/`SLOTS`, also read by the app through `officeSlots`): 8 rooms (CMD, REC, R, B, A, LAB, C, WAR),
24 workstations all facing the north window + 6 meeting seats; `firstFreeDesk(taken, role)` puts the commander in CMD and ADR/PRD
in REC, operators fill `DESK_ROOM_ORDER` (A, B, C, LAB...). The War Room (`war: true`, `door: 'west'`, full depth at the end of the
corridor) has no slots: `warAt` gives it the hover cursor and a click calls `onRoomClick('WAR')` (app → `openOpsChat`). Its look
follows `squadState()` through `office.war` (`WAR_LOOK` idle/live/paused, set in `syncOffice`; `animate` pulses 'live'), with two
red `PointLight`s that always stay in the scene; the label gets `.live` ("AO VIVO").
`buildOffice` batches furniture parts by geometry + material into InstancedMeshes (`put`, unit box scaled per instance, in the
frame of each desk/chair). Tall outer walls are a cutaway: `applyCamera` shows only the two whose inner face looks at the camera.
The office key light casts shadows rendered only when `office.shadowDirty` (build, walls swapped, quality), never per frame.
The running desk's lamp is one `PointLight` that always stays in the scene (intensity 0 when idle, so no recompile) plus a
camera-facing glow plane (the bundle has no Sprite). The office has no clock overlay (removed); the green ✓ on markers comes
from the app (`deliveredIn`, office view only).
Office life (`lifeTick`, office view only, motion on): a purely visual scheduler moves "actors" (visual positions through
`lifePos` in `agentPoint`) along door/corridor paths (`officePath`) for meetings, visits, calls and breaks, with badges
(`.life-layer`) and arcs (`gl.lifeArcs`). It never touches `a.desk`; `lifeReset` puts everyone back (mode switch, pause,
Handoffs, motion off, `startMove`). `MapNetwork.officeLife.{state,kick}` helps testing. Idle badges carry a DEMO mark.
The run in the office (`MapNetwork.ops`, from the app's `officeOps()`, sent by `render()` inside `set()` and by `officeFeed()`
(rAF batched, signature without images) on every room change: `roomPush`/`roomUpdate`/`roomRemove`/`roomChrome`): while a run
exists (or its last errands play, `opsBusy`) the random acts end and none starts. `crew` = agents with a popup (commander
planning/awaiting with `hold:'war'`, the baton holder with its last activity chip, a called colleague with `hold:'call'` beside
the caller); `events` = errands from room messages numbered by seq (`ops:'brief'` say → commander to the first agent, baton →
carried to the next desk, final baton → to the commander for review, `ops:'stop'` clears them). `applyOps` never replays (first
data or another project seeds `ops.seen`; events seen outside `lifeOn()` are skipped). `opsTick` (inside `lifeTick`) reconciles
holds and starts queued errands as life acts (`act.ops`, `OPS_SPEED`, errands stay `OPS_STAY`); `doorOf` returns `{in,out}`
(the War Room opens west). Popups (`.ops-pop` in `.ops-layer`, `placeOps`, data-action select-agent: chip, current action `doing`, and a speech balloon `.ops-say`
with the agent's latest line of the run, `say` from `officeOps`) take the agent card's place
in `layoutCards` (`POP_W`/`POP_H`, sticky offset, a walking popup rides above its agent) and show with motion off too.
`MapNetwork.officeOps.{live,settled}` drives the demo pacing (`live` = 'office' | 'city' | '': beats are spaced in both views, the
office also waits for the walks). In the city the same data drives `opsCity`: `gl.runSet` makes each crew agent's plaza glow in its
tone (`RUN_TONE`: breathing emissive, two rings, a light column `beamGeo`, animated in `runAnimate`), open calls become two-way
`runLinks` (tone links in `buildArcs`), and each errand becomes a comet `gl.runBurst` (a `signalTex` clone with one head carried
from sender to receiver, which pulses with `pulseAt({color})`) plus a temporary label in `ops.tags`; `placeCityTags` puts an
`.ops-tag` (state chip) over each agent at work and toggles `.map-node.ops-on` (`--ops-tone`).
