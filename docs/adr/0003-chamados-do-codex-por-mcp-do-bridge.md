# Chamados de agentes Codex passam por um servidor MCP do próprio bridge

O Codex não tem subagentes definidos pela linha de comando (o `--agents` do Claude). Para que um agente Codex chame colegas do squad, o bridge expõe um endpoint MCP local (`/mcp`, JSON-RPC mínimo, sem dependência) com a ferramenta `chamar_colega`; cada execução Codex recebe esse servidor por `-c mcp_servers.squad.*` com um token próprio da execução, e o colega chamado roda como uma execução filha no Perfil dele. Execuções Claude continuam com o `--agents` nativo, que mostra o texto do subagente ao vivo.

## Considered Options

- Agents SDK da OpenAI ou A2A: outro motor ou um gateway extra; nenhuma das CLIs fala A2A como cliente.
- Emular chamados por marcadores no texto e `resume`: frágil.
- MCP para os dois Adapters: um caminho só, mas perderia o stream ao vivo do subagente no Claude.
