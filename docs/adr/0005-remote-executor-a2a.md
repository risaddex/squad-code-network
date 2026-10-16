# Executor remoto e plugin cliente A2A

Status: implementado para revisão humana (etapa 10).

Um adapter de plugin pode declarar `executionMode: 'remote'`. O bridge valida, registra e acompanha uma execução remota por `startRemote`/`resumeRemote`, sem resolver binário, criar projeto Git ou produzir argv. O modo padrão continua local. Esse ponto de extensão genérico conserva a separação do ADR 0004: o protocolo A2A e a configuração do gateway pertencem ao plugin `plugins/a2a-client`.

## Contratos e responsabilidade

O plugin anuncia catálogo público e uma rota de descoberta autenticada pelo bridge. A UI seleciona agente por Card e vincula `{projectId, agentId, environmentId, localProject}` ao perfil. `localProject` é a pasta lógica da operação no SQUAD/CODE, conferida na execução; o caminho físico remoto e as políticas pertencem ao gateway. A seleção não cria nem limpa ambientes. O Card anuncia skills; o catálogo opcional de BaseTool descreve ferramentas/garantias do provider e não concede execução de ferramentas locais.

Endpoint e token ficam na configuração do host, fora do workspace e da UI. O plugin usa somente as rotas canônicas do gateway configurado, HTTPS (HTTP apenas em loopback explícito), sem seguir redirects ou URLs arbitrárias dos Cards. O token é obtido a cada chamada e não vai para banco, eventos ou mensagens de erro. O `iss`/`sub` decodificado fixa a identidade da execução; a autenticação criptográfica continua sendo responsabilidade do gateway.

`startRemote({id, profile, prompt, systemPrompt, opts, emit})` e `resumeRemote({id, profile, emit})` retornam um handle com `done`, `cancel()` e `close()`. `done` só resolve com desfecho confirmado. `close` interrompe acompanhamento local sem afirmar que o agente remoto parou. Os eventos passam pelo mesmo histórico e SSE do bridge. O snapshot de perfil e o modo de execução ficam no histórico para recuperação após restart.

## Persistência e incerteza

`prepareRemote` grava intenção, destino, identidade e mensagem imutável no journal SQLite antes da admissão durável no bridge, sem enviar HTTP. O snapshot dos parâmetros do primeiro Send também é persistido antes do envio. Um taskId conhecido passa a ser consultado, nunca reenviado. Se SendMessage perder a resposta antes de obter taskId, só é seguro repetir o mesmo requestId/payload quando o Card negociar `urn:squad:agent-runtime:request:v1`. Sem essa garantia, o estado permanece incerto.

Cancelamento grava intenção e aguarda confirmação remota. Timeout ou encerramento do bridge não equivale a cancelamento confirmado. Restart preserva execuções remotas pendentes e retoma o journal, sem fallback local nem alteração de destino por edição posterior do perfil. Tarefas inacessíveis, credencial de outro principal ou plugin ausente permanecem pendentes para reconciliação, consumindo a admissão correspondente.

SSE upstream é opcional. A queda do stream de tarefa conhecida cai para GetTask e não dispara novo SendMessage. O gateway atual anuncia streaming desabilitado e é acompanhado por polling. O SSE da UI mantém o mecanismo de replay já existente no bridge.

## Limites

A compatibilidade desta entrega é com A2A 1.0 JSON-RPC e o diretório autenticado do gateway SQUAD; um peer A2A externo precisa ser exposto por esse diretório. Não é descoberta universal de endpoints arbitrários nem compatibilidade automática com A2A 0.3. O cliente não concede tools, políticas de CLI, acesso ao ambiente ou autenticação de modelo.

Artefatos externos não são baixados. Ausência de custo ou uso permanece desconhecida e as execuções remotas ficam fora dos agregados locais. O cliente confere o hash de saída quando há evidência, mas o histórico do SQUAD/CODE preserva texto e referências públicas; os artefatos completos continuam no gateway. Ambiente stateful não significa sessão de conversa continuada. Autenticação inicial/renovação do JWT é responsabilidade do operador do host; o plugin não implementa login interativo. Testes usam fixtures isoladas e gateway real com executor fake, sem LLM, deploy ou configuração pessoal.
