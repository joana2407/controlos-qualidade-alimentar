# Mapa de importação — controlo de quebráveis

Foram analisados os dois ficheiros de controlo de materiais de vidro e quebráveis. A extração identificou **633 pontos de controlo** associados a áreas, fábricas e periodicidades. Os nomes foram transcritos a partir das listas dos ficheiros e as frequências foram lidas do sufixo apresentado em cada ponto, como `(D)`, `(S)`, `(Q)` ou `(M)`.

| Unidade produtiva | Origem | Associação aplicada |
|---|---|---|
| Fábrica 1 (Fatiado) | Abas sem `SG` no ficheiro de Fábricas 1 e 3 | Fábrica 1 (Fatiado) |
| Fábrica 2 (granel) | Ficheiro R-P8.12(01) | Fábrica 2 (granel) |
| Fabrica 3 (Sem Gluten) | Abas que incluem `SG` no ficheiro de Fábricas 1 e 3 | Fabrica 3 (Sem Gluten) |

O catálogo integra as áreas reais, incluindo matéria-prima, produção, lavagem, tratamento térmico, arrefecimento, embalamento, logística, zonas sociais e áreas específicas de SG. A maioria dos pontos tem frequência semanal ou mensal; existem também cinco pontos diários na área **Zona Tratamento Térmico** da Fábrica 1. Nenhum ponto com periodicidade quinzenal foi identificado nos dois ficheiros analisados.

O ficheiro estruturado de apoio à importação encontra-se fora do projeto em `catalogo_quebraveis.json`; a aplicação recebe apenas os dados operacionais persistidos na base de dados.
