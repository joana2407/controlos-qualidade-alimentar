# Matriz de autorizações — Ocorrências A&S

O módulo de Ocorrências A&S usa a sessão PIN operacional do QualiControl. As autorizações são configuráveis pela **Responsável de Qualidade** em **Configuração → Autorizações de ocorrências** e são guardadas por perfil PIN.

| Papel | Ocorrências: consulta | Criar/editar tratamento | Avaliar eficácia / eliminar | Reclamações a fornecedores |
|---|---:|---:|---:|---:|
| `user` | Sim | Sim | Não | Consulta e registo |
| `admin` | Sim | Sim | Sim | Consulta e registo |
| `gestao` | Sim | Não | Não | Consulta |

| Âmbito | Navegação visível | Dados de ocorrências | Dados de reclamações |
|---|---|---|---|
| `all` | Dashboard, lista, criação e reclamações | Permitidos conforme o papel | Permitidos conforme o papel |
| `reclamacoes` | Apenas «Reclamações a fornecedores» | Bloqueados pelo servidor | Permitidos conforme o papel |

## Valores iniciais e governação

Na ausência de configuração explícita, as Técnicas de Qualidade recebem `user/all` e a Responsável de Qualidade recebe `admin/all`. Estes valores preservam a separação operacional existente e podem ser alterados apenas pela Responsável de Qualidade. O servidor aplica as verificações em todas as operações de leitura, escrita, eficácia, eliminação, imagens e sugestões assistidas, pelo que ocultar um menu não é a única barreira de segurança.

## Ecrãs e fluxos preservados

O módulo inclui dashboard, lista filtrável, detalhe de leitura, editor completo, criação, tratamento com evidências, avaliação de eficácia, reincidência, sugestões BRC/correção/ação corretiva e reclamações a fornecedores. Os KPI do dashboard encaminham para a lista com os filtros de estado, prazo ou eficácia correspondentes.
