# Roteiro BRCGS Food Safety para a plataforma QualiControl

## Objetivo e enquadramento

Este roteiro identifica como a plataforma pode apoiar mais requisitos de **BRCGS Global Standard Food Safety, Issue 9** numa indústria de panificação. É uma avaliação funcional e não substitui a norma oficial, as orientações de interpretação, a análise HACCP aprovada no local, a legislação aplicável nem a decisão do organismo de certificação. A BRCGS enquadra a gestão de segurança, integridade, legalidade e qualidade do produto, bem como os controlos operacionais de uma unidade de fabrico alimentar.[^brcgs-overview]

> A plataforma deve funcionar como **sistema de evidência, monitorização e ação**, e não como substituto dos procedimentos e verificações no terreno.

## Cobertura atual e lacunas prioritárias

| Domínio BRCGS | Evidência já suportada pela plataforma | Lacuna a fechar | Prioridade |
|---|---|---|---|
| Compromisso da gestão e cultura de segurança | Painel Hoje, indicadores, responsabilidades por PIN, tarefas e relatórios | Plano anual de cultura, objetivos, inquéritos/observações comportamentais e revisão de gestão | Alta |
| HACCP e controlo de PCC | Detetores de metais, alertas críticos e registo de controlos | Plano HACCP digital, fluxograma, análise de perigos, limites críticos, monitorização, validação e verificação | Crítica |
| Auditorias internas e inspeções de instalações | BPHF por áreas, checklist mensal e gestão de NC | Programa de auditorias por cláusula, calendário baseado em risco, auditor independente, evidência e verificação de eficácia | Alta |
| CAPA e produto não conforme | NC, ações corretivas, responsáveis, prazos, evidências e tendências | Análise de causa-raiz estruturada, ação imediata, ação preventiva, verificação de eficácia, bloqueio/quarentena e destino do produto | Crítica |
| Rastreabilidade e recolha | Lote em shelf-life e expedição; exportação de relatórios | Traçabilidade um passo atrás/à frente, balanço de massas, simulação de recolha, tempos, clientes afetados e dossiê de incidente | Crítica |
| Fornecedores e matérias-primas | Não existe módulo dedicado | Aprovação, avaliação de risco, certificados, especificações, avaliações de desempenho, fraude e defesa alimentar | Crítica |
| Produto, rotulagem e alergénios | Rotulagem de expedição e controlo sensorial | Matriz de alergénios, validação de rótulo/receita, controlo de alterações, reconciliação de embalagens e verificação de limpeza/changeover | Crítica |
| Processo e equipamentos de medição | Detetores de metais e controlos operacionais | Plano de calibração, estado do equipamento, resultados, tolerâncias, ações após falha e verificação de PCC/PCQ | Alta |
| Instalações, limpeza, manutenção e pragas | BPHF, quebráveis, pendências e imagens de referência | Plano mestre de limpeza, químicos, manutenção preventiva, controlo de pragas, inspeção de estruturas e validações | Alta |
| Pessoas e competências | Perfis de equipa, PIN e atribuição de operador | Matriz de competências, formação, reciclagens, avaliação de eficácia, aptidão/higiene e visitantes | Alta |
| Food defence e food fraud | Não existe módulo dedicado | Avaliação de vulnerabilidade, medidas de mitigação, revisão periódica e exercícios | Alta |
| Incidentes, retirada e recolha | NC e ações corretivas | Gestão de incidente, equipa de crise, contactos, decisão de retirada/recolha, comunicação e teste anual | Crítica |

## Implementação recomendada

### Primeiros 30 dias: fecho de riscos de certificação

O primeiro incremento deve criar um módulo de **CAPA e produto não conforme** com quatro blocos obrigatórios: contenção imediata, causa-raiz, ação corretiva/preventiva e verificação de eficácia. Cada bloco deve ter responsável, prazo, estado, anexos e aprovação de fecho. A informação deve alimentar automaticamente a análise de tendências, pois a Issue 9 reforça a investigação de não conformidades, a causa-raiz, os responsáveis, os prazos e a verificação de implementação.[^asc-qms]

Em paralelo, deve ser criado um módulo de **rastreabilidade e recolha**. O utilizador deve conseguir selecionar um lote de produto acabado, registar matérias-primas/lotes de origem, quantidades produzidas e expedidas, clientes e destinos. Um exercício de recolha deve gerar automaticamente o balanço de massas, a lista de clientes/lotes afetados, o tempo de resposta e as evidências da equipa de crise. A rastreabilidade e os balanços de quantidade são áreas fundamentais do sistema de gestão da qualidade e segurança alimentar.[^asc-qms]

### 30 a 90 dias: prevenção e controlo sistemático

O segundo incremento deve conter o **HACCP operacional**. Recomenda-se uma biblioteca de fluxogramas por família de produto e fábrica, perigos, medidas de controlo, PCC/PCQ, limites críticos, frequência, método, responsável, ação de desvio e ligação automática à NC. Qualquer alteração de fórmula, fornecedor, linha, equipamento ou processo deve desencadear uma revisão de risco e a revalidação aplicável. A validação do plano antes da implementação e antes de alterações que possam afetar a segurança é um foco explícito da Issue 9.[^nsf-i9]

O mesmo ciclo deve incluir **alergénios, rotulagem e changeover**. Para panificação, a matriz deve contemplar pelo menos glúten, sésamo, soja, leite, ovo, frutos de casca rija e qualquer alergénio efetivamente usado no local. A plataforma deve controlar aprovação de arte final, versão de rótulo, receita, lote de embalagem, reconciliação de etiquetas, limpeza de mudança de produto e libertação pós-changeover.

### 90 a 180 dias: gestão, fornecedores e preparação de auditoria

O terceiro incremento deve criar um **portal de fornecedores e matérias-primas** com avaliação de risco, aprovação inicial, certificados, especificações, declaração de alergénios, risco de fraude/defesa, incidências, desempenho e revisão programada. A gestão e monitorização de fornecedores é um dos requisitos fundamentais assinalados para a Issue 9.[^asc-qms]

Deve também ser acrescentado o **programa de auditorias internas**. Cada auditoria deve ter âmbito, cláusulas, fábrica/linha, auditor, plano, lista de verificação, achados, classificação, ações e verificação. A plataforma deve impedir o fecho sem evidência e disponibilizar à gestão uma matriz de cobertura anual. O recurso oficial de autoavaliação BRCGS pode servir de estrutura-base para a primeira biblioteca de listas de verificação.[^brcgs-guidance]

Por fim, deve ser criado o ciclo de **revisão pela gestão e cultura de segurança**: objetivos, indicadores, tendências de NC/reclamações/auditorias, riscos, decisões, recursos, plano de cultura e acompanhamento de ações. A BRCGS destaca a cultura de segurança alimentar e a participação da gestão como componentes relevantes da Issue 9.[^brcgs-overview] [^qima-i9]

## Requisitos transversais de desenho

Cada novo módulo deve preservar a segregação por fábrica/linha, a autoria através de PIN, os registos com data/hora, anexos, histórico imutável de alterações, estado, responsável e exportação de evidência. Para auditoria, cada ecrã deve permitir filtrar por período, fábrica, lote, fornecedor e estado, além de exportar uma lista de registos e anexos.

Recomenda-se uma matriz interna que relacione cada campo e fluxo com a cláusula BRCGS aplicável. A matriz deve ser revista pela Responsável de Qualidade contra a cópia oficial da norma e a guideline de interpretação. A BRCGS disponibiliza a norma, o guia de interpretação, o guia de alterações, o guia rápido, posições técnicas e listas de autoavaliação; a posição F926 para a Issue 9 é indicada como obrigatória a partir de 10 de agosto de 2026.[^brcgs-guidance]

## Ordem de execução sugerida

| Fase | Entregável | Resultado verificável |
|---|---|---|
| 1 | CAPA, produto não conforme e rastreabilidade/recolha | Dossiê de incidente e exercício de recolha com balanço de massas |
| 2 | HACCP operacional, PCC/PCQ, calibração e alergénios | Monitorizações, desvios e validações ligados a cada controlo |
| 3 | Fornecedores, fraude/defesa e auditorias internas | Avaliação de fornecedores e programa anual de auditorias com CAPA |
| 4 | Cultura, competências e revisão pela gestão | Matriz de formação, indicadores, atas e plano de melhoria |

## Referências

[^brcgs-overview]: [BRCGS — Food Safety overview](https://www.brcgs.com/our-standards/food-safety/)
[^brcgs-guidance]: [BRCGS — Food Safety help and guidance](https://www.brcgs.com/our-standards/food-safety/help-and-guidance/)
[^asc-qms]: [ASC Food Safety — BRCGS Issue 9: Food Safety and Quality Management System](https://ascfoodsafety.com/brcgs-for-food-safety-changes-food-safety-and-quality-management-system/)
[^nsf-i9]: [NSF — BRCGS Food Safety Standard Issue 9 published](https://www.nsf.org/knowledge-library/brcgs-food-safety-standard-issue-9-released)
[^qima-i9]: [QIMA — Guide to navigating BRCGS Issue 9](https://www.qima.com/blog/brcgs/navigating-brcgs-issue-9)
