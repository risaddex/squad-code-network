# Perfis ficam no banco do bridge, fora do workspace

Os Perfis guardam caminhos da máquina (executável, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`) e limites de uso de contas pessoais. Decidimos guardá-los numa tabela própria do `squad.db`, gerida por `/api/profiles`, e não no `state` do workspace: eles não entram no export/backup JSON nem nas versões, e o agente guarda só o `profileId` (id desconhecido cai no Perfil padrão). Segredos de telemetria nunca são guardados: só o nome da variável de ambiente que os contém.

## Consequences

Importar um workspace em outra máquina preserva a escolha de Perfil de cada agente, mas os Perfis precisam ser recriados lá; até isso, tudo roda no Perfil padrão.
