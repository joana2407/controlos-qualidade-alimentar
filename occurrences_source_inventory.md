# Inventário de origem — Registo Ocorrencias

## Referência

- Projeto de origem: **Ocorrências A&S**.
- Tarefa de origem: **Registo Ocorrencias** (`ex5pdBqpMrvmT9OXHtZnRT`).
- O layout principal é definido por `Dashboard.tsx`; os fluxos complementares estão em `OcorrenciasList.tsx`, `OcorrenciaNew.tsx`, `OcorrenciaForm.tsx` e `OcorrenciaDetail.tsx`.

## Dashboard preservado

O dashboard de origem contém filtros persistentes por fábrica, tipo de ocorrência, origem, estado, intervalo de datas e âmbito SGSQA. Inclui exportação Excel, alertas de prazo, KPIs de total/abertas/fechadas/prazos/eficácia, evolução mensal, distribuição por origem, fábrica, âmbito SGSQA, requisito BRC Food V9, avaliação de eficácia e lista de ocorrências abertas com prazo próximo.

## Parametrizações de ocorrências

As ocorrências suportam número, fábrica, data, tipo (`NC`/`Nnc`), origem (`I`, `R`, `F`, `AI`, `AE`), cliente/fornecedor/auditor, requisito BRC, âmbito SGSQA, produto/lotes/validade/matéria-prima/quantidade, classificação de produto não conforme, descrição e imagens, perigos, justificação, causa-raiz, correção, ação corretiva, responsáveis, prazos, evidências e imagens, estado, fecho, eficácia, reincidência, objetivos, efeito e observações.

Inclui ainda reclamações a fornecedores com identificação, produto/lotes, categoria produto/serviço, perigo, tratamento, evidências, reincidência, fecho e observações.

## Regras de acesso e fluxo

O projeto de origem usava perfis PIN com papéis `user`, `admin` e `gestao`, além de um âmbito `all` ou `reclamacoes`. A criação e atualização exigem permissão de escrita. A avaliação de eficácia é restrita ao papel de administração/Responsável de Qualidade. O estado mantém-se aberto quando não existe tratamento completo; o tratamento requer correção, ação corretiva, responsável e prazo. Existe autoria por fase de abertura, tratamento e eficácia.

## Compatibilização necessária

No QualiControl, as autorizações devem ser mapeadas para os perfis PIN existentes: técnicas de qualidade com criação e tratamento; Responsável de Qualidade com parametrização, eliminação, fecho e avaliação de eficácia. As fábricas da origem precisam ser relacionadas com os códigos de fábrica/linha atuais do QualiControl, sem perder os valores históricos da origem.
