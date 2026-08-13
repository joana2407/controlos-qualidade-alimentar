# Validação da segmentação por fábrica

## Unidades produtivas inicializadas

Foram configuradas e confirmadas na base de dados as seguintes unidades ativas: **Fábrica 1 (Fatiado)**, **Fábrica 2 (granel)**, **Fabrica 3 (Sem Gluten)** e **Linha Croutons**. Cada unidade possui um código próprio e é apresentada pela consulta `quality.metadata`, que alimenta os seletores da aplicação.

| Código | Unidade produtiva | Estado |
|---|---|---|
| `F1_FATIADO` | Fábrica 1 (Fatiado) | Ativa |
| `F2_GRANEL` | Fábrica 2 (granel) | Ativa |
| `F3_SEM_GLUTEN` | Fabrica 3 (Sem Gluten) | Ativa |
| `LINHA_CROUTONS` | Linha Croutons | Ativa |

## Teste funcional controlado

O teste automatizado `server/factory.scope.logic.test.ts` executa cenários isolados de duas fábricas. Confirma que o filtro devolve exclusivamente os registos da fábrica selecionada, que o cumprimento do plano é calculado sobre as tarefas filtradas e que os contadores de NC abertas e críticas não misturam unidades produtivas.

| Cenário | Resultado esperado | Resultado verificado |
|---|---|---|
| Filtrar tarefas pela Fábrica 1 | Apenas duas tarefas da Fábrica 1 | Confirmado |
| Cumprimento do plano por fábrica | Fábrica 1: 50%; Fábrica 2: 100% | Confirmado |
| NC abertas por fábrica | Fábrica 1: 1 crítica aberta; Fábrica 2: 1 NC aberta não crítica | Confirmado |

Os endpoints de painel, tarefas, não conformidades e relatórios usam a mesma função `scopeToFactory`. Assim, a seleção feita no interface restringe os dados antes do cálculo dos indicadores e antes da exportação CSV.

## Revisão visual

Foi verificada a presença dos seletores de fábrica no painel «Hoje», nos formulários de controlo, em não conformidades, em relatórios e na configuração de planos. Os campos comunicam que a fábrica selecionada é associada aos registos, às NC e às ações corretivas.
