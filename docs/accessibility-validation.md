# Verificação de acessibilidade — QualiControl

**Data:** 13 de agosto de 2026  
**Âmbito:** painéis, formulários de controlo, gestão de não conformidades, relatórios e configuração.

## Resultado da verificação

Foi executada uma verificação automatizada de estrutura acessível através de `server/accessibility.structure.test.ts`, que confirma foco global visível, presença de rótulos nos formulários críticos, controlos semânticos e comunicação textual dos estados C/NC. Foi também efetuada revisão visual responsiva dos ecrãs de detetores de metais, controlo sensorial de produto acabado e BPHF.

| Aspeto verificado | Resultado | Evidência de implementação |
|---|---|---|
| Página ou aspeto | Resultado | Evidência verificável |
|---|---|---|
| Foco visível global | Conforme | O teste estrutural confirma `outline-ring/50` e a ausência de `outline: none` em `index.css`. |
| Formulários BPHF, sensorial, shelf-life e detetores | Conforme | O teste conta rótulos `Label`, confirma botões e área de texto nos formulários críticos. |
| Gestão de NC | Conforme | O teste confirma rótulos e o controlo de seleção de ficheiros de evidência. |
| Estados críticos | Conforme | O teste confirma a presença textual de **C**, **NC**, “Regra crítica ativa” e “não conformidade crítica”. |
| Responsividade móvel | Conforme | Foram capturados e revistos os ecrãs BPHF, controlo sensorial de produto acabado e verificação de detetores de metais a 390 × 844 px. |
| Contraste e legibilidade | Conforme na revisão visual | A paleta usa marinho para autoridade, verde-petróleo para ação/conformidade e vermelho para desvios críticos, sobre superfícies claras. |
| Mensagens de erro | Conforme | Campos obrigatórios usam validação nativa e os fluxos de negócio apresentam mensagens através de notificações. |

## Limitação e recomendação de aceitação

> Esta validação combina um teste estrutural automatizado com uma revisão visual. Antes do arranque em produção recomenda-se uma sessão curta com dois utilizadores internos, realizada com teclado físico e, se disponível, um leitor de ecrã. A sessão deve confirmar os fluxos de registo de NC crítica, fecho validado e anexação de evidências.

## Checklist de aceitação operacional

| Teste com utilizador | Critério de aprovação |
|---|---|
| Registar BPHF por teclado | É possível chegar a todos os campos e submeter o controlo sem rato. |
| Registar NC de detetor de metais | O alerta crítico, a criação de NC e o acesso ao tratamento são compreendidos sem depender exclusivamente da cor. |
| Fechar NC | Apenas o administrador consegue selecionar o estado fechado e é obrigado a indicar o validador. |
| Anexar evidência | A equipa distingue claramente a evidência geral da NC da evidência ligada a uma ação de tratamento. |
