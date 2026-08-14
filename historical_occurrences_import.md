# Migração histórica — Ocorrências A&S

Foram migrados para o QualiControl os dados históricos disponíveis nos ficheiros de origem associados ao projeto **«Registo Ocorrencias»**.

| Conjunto | Fonte | Registos importados | Regra de reconciliação |
|---|---|---:|---|
| Ocorrências | `Registodeocorrências.xlsx` | 53 | Numeração 1–53, com proveniência `historic-import` |
| Reclamações a fornecedores | `RegistodeReclamaçõesafornecedores.xlsx` | 18 | Número original por ano, com proveniência `historic-import` |

## Salvaguardas aplicadas

A importação é transacional e idempotente: pode ser executada novamente sem duplicar registos já marcados com a proveniência histórica. As datas abreviadas de auditoria foram normalizadas para 2026 e três ocorrências sem texto de descrição foram preservadas com uma indicação explícita de que a descrição estava ausente na fonte. As evidências textuais, ações, responsáveis, prazos, fechos, eficácia e observações foram mantidos nos campos equivalentes.

> A fonte disponível para esta migração foram os ficheiros históricos associados à tarefa de origem. Caso existam registos criados no dashboard de origem depois desses ficheiros, será necessário exportá-los desse projeto para uma importação complementar.
