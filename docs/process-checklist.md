# Checklist de acompanhamento da implementação de processos

## Origem

O catálogo `client/src/lib/processControlCatalog.ts` foi extraído do ficheiro `Controlo de Processos.xlsx`, organizado pelas folhas Fábrica 1, Fábrica 2 e Fábrica 3 (SG). Foram preservados os nomes dos produtos, as três fases e os parâmetros tal como aparecem no ficheiro.

## Estrutura operacional

- **Identificação:** fábrica, data de produção, horário/turno, responsável do turno, produto e lote/referência.
- **Fase inicial:** verificação dos lotes em uso e operações iniciais específicas, incluindo escaldamento quando aplicável.
- **Fase de produção:** preparação/mistura, gramagem, repouso/estufa, temperaturas, tempos, velocidades, cozedura, arrefecimento, doseamento, decoração ou operações especiais.
- **Fase final:** embalamento, rotulagem, unidades por massa, quebras e motivos, sobras e caixas por massa.
- **Rastreabilidade:** cada ficha guarda o parâmetro de referência, o valor observado, a decisão C/NC/N/A, observações, ação corretiva, data, turno, responsável, produto, lote e fábrica.

## Campos dependentes de confirmação

A folha Excel não define de forma fechada:

1. A nomenclatura oficial dos turnos e os horários exatos.
2. O formato único do lote ou a relação entre lote e data de produção.
3. Os critérios de aceitação para unidades por massa, quebras, sobras e caixas por massa.
4. O responsável formal pela aprovação/fecho de uma ação corretiva.
5. Se certos pontos finais devem ser registados por massa, por forno, por linha ou por lote.

Estes campos ficam editáveis na ficha e são destacados na interface para validação com a Produção antes de transformar os critérios em regras automáticas.

## Persistência

A primeira versão é um painel autónomo com persistência local no navegador (`localStorage`), permitindo vários registos por dia, produto, fase e turno. Os registos são incluídos no Backup JSON geral da aplicação. A integração futura com o Plano do Dia e com o servidor deve manter a mesma estrutura de payload e a rastreabilidade dos campos.
