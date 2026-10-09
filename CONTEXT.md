# SQUAD/CODE

Organiza um squad de agentes de desenvolvimento que executam features através de motores de IA de linha de comando, dirigidos por um bridge local.

## Execução

**Adapter**:
Tipo de motor que o bridge sabe dirigir, registrado no bridge: embutido (`claude`, `codex`) ou trazido por um Plugin; traduz as opções e os eventos daquele motor.
_Avoid_: engine, provider, runtime

**Perfil**:
Instância configurada de um Adapter, criada pela pessoa: nome, executável, diretório de configuração da conta e padrões. Vários perfis do mesmo Adapter podem rodar em paralelo.
_Avoid_: adapter (para a instância), conta, profile

**Chamado**:
Pedido que um agente em execução faz a outro membro do squad, esperando o relatório dele para continuar; o colega chamado roda no próprio Perfil.
_Avoid_: subagente, call, handoff (handoff é a passagem de bastão entre etapas da rota)

**Janela de uso**:
Limite do plano da conta de um Perfil medido em percentual com horário de reset; hoje há a de 5 horas e a de 7 dias.
_Avoid_: rate limit, cota, quota

**Perfil reserva**:
Perfil do mesmo Adapter que recebe as novas execuções quando a Janela de uso de outro Perfil passa do limiar.
_Avoid_: fallback, backup

**Perfil padrão**:
Perfil usado por agentes que não escolheram um; pode ser forçado para todas as execuções nas Configurações.
_Avoid_: perfil global, default

## Extensão

**Plugin**:
Pasta fora do repositório com `squad-plugin.json` que estende o SQUAD/CODE sem alterar o núcleo nem o que já está salvo no workspace: conteúdo de catálogo (agentes, categorias, souls, diretrizes, avatares, Temas, padrões de execução), código do bridge (rotas próprias, eventos de execução, veto antes de iniciar uma execução, Adapters) ou os dois. Conteúdo pode vir de qualquer arquivo de configuração; código só é ativado pela Configuração local desta máquina.
_Avoid_: pacote, extensão (para a pasta), addon, módulo

**Capacidade**:
Permissão que um Plugin com código pede no manifesto e que a pessoa concede na Configuração local para usar um ponto de extensão sensível (mudar uma execução, registrar um Adapter, ver o conteúdo dos prompts).
_Avoid_: capability, permissão (para o pedido)

**Tema**:
Paleta da interface e do mapa (cidade e escritório) oferecida por um Plugin e escolhida nas Configurações.
_Avoid_: skin, estilo

**Configuração local**:
Os arquivos `squad.config.json` (compartilhável) e `squad.local.json` (desta máquina, fora do git) que apontam os Plugins (`plugins.paths` / `plugins.disabled`) e declaram Perfis; o local vence o compartilhado.
_Avoid_: settings, preferências
