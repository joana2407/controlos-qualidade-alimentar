# Auditoria funcional — 31/08/2026

## Evidências de navegação

- O perfil **Gestão** entrou no painel em modo de consulta, sem ações de alteração disponíveis.
- O painel **Hoje** carregou 21 controlos agendados para 31/08/2026: 15 concluídos e 6 por realizar, com execução apresentada de 71,4%.
- A ação **Consultar resultados** de BPHF abriu `/controlos/bphf?plannedTaskId=690002&plannedDate=2026-08-31&view=results&factoryId=2`.
- A consulta apresentou o cabeçalho de resultados, a fábrica selecionada e 12 registos BPHF em 31/08/2026, coerentes com a completitude de 12/12 e 100% da Fábrica 2.
- O painel Hoje voltou a apresentar, após o carregamento normal dos dados, 21 controlos agendados, dos quais 15 concluídos e 6 por realizar. Os cartões pendentes continham rotas para o formulário da tarefa respetiva, incluindo BPHF, Food Defense, Quebráveis e Checklist Mensal.
- O carregamento inicial pode apresentar valores provisórios a zero durante alguns segundos; depois da consulta operacional terminar, os valores e cartões foram apresentados corretamente.
- A rota pendente de BPHF abriu `/controlos/bphf?plannedTaskId=690001&factoryId=1`, selecionou a Fábrica 1 e mostrou o progresso de 6/12. No perfil Gestão, o formulário ficou corretamente bloqueado por não ser a responsável atribuída, mantendo a consulta dos nove registos já realizados para a data.
- A consulta de Detetores para F1 abriu com o identificador da tarefa e a data operacional de 31/08/2026. Mostrou três registos, correspondentes às linhas Linha 1, Linha 2 e Linha Croutons, e 3/3 controlos concluídos. As Fábricas 2 e 3 mostraram 1/1 e 100%, coerentes com os registos do dia.
- Todos os 11 atalhos dos módulos de controlo abriram a rota e o painel correspondente: BPHF, Detetores de Metais, Controlo sensorial, Shelf-life, Checklist mensal, Caixas de sugestões, Quebráveis, Controlo à expedição, Análises internas, Controlos de Temperatura e Food Defense. A abertura de Food Defense apresentou as três fábricas, o estado 0/131 e o bloqueio de preenchimento adequado ao perfil Gestão.
- Os seis atalhos principais abriram Hoje, Plataforma, Controlos, Incidências, Relatórios e Backups diários nas rotas respetivas. O painel de Backups diários apresentou os dois ficheiros Excel existentes e as respetivas ligações de descarga.

## Evidências de dados

- A verificação SQL não encontrou tarefas do Plano do Dia marcadas como concluídas sem qualquer registo correspondente.
- As tarefas BPHF pendentes inspecionadas tinham registos abaixo do mínimo de 12 combinações critério/Área-Zona: F2 em 28/08 (5/12), F3 em 28/08 (9/12) e F1 em 31/08 (6/12).
- Foi identificada e corrigida uma divergência na lista de tarefas: a Checklist Mensal não transportava as atribuições múltiplas de Áreas/Zonas para o cálculo histórico.
- Foi identificada e corrigida uma divergência no fecho dos Detetores: o registo passava a usar as linhas selecionadas na tarefa, em vez de exigir todas as linhas configuradas.
- Os registos históricos podem conservar internamente o estado `pending` quando foram criados antes da associação obrigatória à tarefa. A interface recalcula a satisfação a partir dos registos por data, fábrica e módulo, pelo que esses casos não foram apresentados como pendentes no painel Hoje nem na agenda.

## Ligações externas

As ligações do menu lateral para Gestão de Ocorrências, Gestão de Matérias-Primas, Plano de Calibração, Plano de Manutenção e os dois painéis de Quebras devolveram resposta HTTP 200. A plataforma externa de registo automático de temperaturas também devolveu HTTP 200. Algumas páginas demoraram mais do que o limite de rede a transferir todos os recursos, mas já tinham devolvido uma resposta válida do servidor.

## Validação técnica

As correções foram cobertas por regressões: a Checklist Mensal mantém a tarefa visível quando falta uma Área/Zona atribuída e os Detetores fecham quando as linhas selecionadas no Plano do Dia estão verificadas. A suíte integral passou com 50 ficheiros de teste e 237 testes; a validação TypeScript e a compilação PWA terminaram sem erros.
