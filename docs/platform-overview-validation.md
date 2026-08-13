# Validação da página «Plataforma»

Esta página traduz a proposta de arquitetura funcional para uma experiência web de orientação e acesso rápido. O objetivo não é duplicar os registos operacionais; é explicar o método de trabalho e conduzir a equipa diretamente para os módulos onde os controlos são executados.

| Bloco da página | Elemento da proposta arquitetural | Destino operacional validado |
|---|---|---|
| Hero «Qualidade alimentar organizada por ação» | Núcleo único de tarefas, respostas, NC, ações, evidências e relatórios. | Painel «Hoje» (`/`) e agenda de controlos (`/controlos`). |
| Três pilares operacionais | Página «Hoje», rastreabilidade de autor/evidência e tratamento de NC até ao fecho. | Painel, controlos, NC e relatórios partilham a mesma arquitetura de dados. |
| Mapa dos sete módulos | Shelf-life, sensorial, BPHF, detetores, caixas de sugestões, quebráveis e checklist mensal. | Cada cartão conduz ao respetivo módulo em `/controlos/:module`. |
| Método «Planear → Registar → Tratar → Aprender» | Fluxo comum de planos, tarefas, respostas, NC, ações e indicadores. | Agenda, execução de controlos, não conformidades e relatórios. |
| Rotina recomendada e princípios de dados | Início do turno na página «Hoje» e estados normalizados C, NC e N/A. | Prioridades diárias e formulários de controlo existentes. |

## Evidência de validação

Os CTAs de entrada e os cartões dos módulos são verificados pelo teste `server/platform-overview.test.tsx`. A rota `/plataforma` é verificada pelo teste `server/platform-route.test.tsx`. A página foi revista visualmente em desktop e em ecrã móvel para confirmar a hierarquia, a legibilidade e o comportamento responsivo.
