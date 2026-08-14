# Auditoria de migração integral — Ocorrências e Reclamações

## Descobertas iniciais

O QualiControl tem atualmente três perfis PIN de qualidade na configuração de origem: Sabrina Esteves, Neuza Antunes e Joana Pina. Os perfis Nuno e Gestão, solicitados para a área de Ocorrências, terão de ser inventariados na plataforma original e mapeados de forma explícita.

A tarefa de origem disponibiliza os ecrãs de dashboard, lista, filtros, detalhe e formulário de Reclamações a Fornecedores, bem como o seu importador histórico. Estes artefactos serão comparados com a implementação atual antes de qualquer substituição.

## Reclamações a Fornecedores — requisitos da origem

A lista original inclui pesquisa, fornecedor, estado, categoria, intervalo de datas, ordenação, exportação Excel, tabela com reincidência e categoria, detalhe, edição, eliminação condicionada e persistência local dos filtros. O dashboard original inclui os filtros de estado, categoria, fornecedor e datas; quatro indicadores; gráficos por fornecedor, mês, categoria por fornecedor e estado.

O detalhe e o formulário de origem expõem campos de setor, produtos afetados, lotes, validade, quantidade, tipo de perigo, correção, ação preventiva, fecho, evidências e reincidência. Estes serão comparados campo a campo com o modelo e os ecrãs do QualiControl.

## Lacuna confirmada na integração atual

O ecrã integrado de Reclamações a Fornecedores é apenas um registo simplificado de fornecedor, data e descrição. Não possui a lista com filtros, dashboard, detalhe, formulário por secções, exportação, gráficos, campos de tratamento, imagens, fecho ou reincidência usados pela plataforma original. A migração requer substituição do ecrã simplificado por um módulo completo, bem como extensão do router e do modelo de dados onde necessário.

## Modelo e router atuais

O modelo de dados do QualiControl já contém os campos necessários para a reclamação completa, incluindo identificação, produto/lotes, perigo, correção, ação corretiva, ação preventiva, fecho, evidências e reincidência. O router atual expõe apenas listagem sem filtros e criação, pelo que serão adicionados detalhe, atualização, eliminação, filtros, fornecedores e indicadores de dashboard sem alterar os dados históricos já importados.

## Estratégia de migração aprovada

Será preservado o modelo histórico já criado. Serão acrescentados ao router os procedimentos de lista filtrada, detalhe, criação completa, atualização, eliminação, lista de fornecedores e estatísticas. A interface substituirá a página simplificada por dashboard, lista, detalhe e formulário por secções, mantendo os filtros persistentes, a exportação e as regras de consulta/escrita configuradas por perfil.

## Critério de conclusão

A integração só será considerada concluída quando os dados, filtros, layouts, parametrizações e regras de acesso do módulo de Reclamações tiverem equivalência verificável com a origem.
