export type FoodDefenseCriterion = { id: string; section: string; criterion: string; implementedControls?: string | null };

export const FOOD_DEFENSE_CRITERIA: FoodDefenseCriterion[] = [
  {
    "id": "fd-1",
    "section": "SEGURANÇA GERAL",
    "criterion": "País de Localização da fábrica, ambiente político e próprio ambiente de segurança da empresa são propicios a falhas no sistema Food Defense",
    "implementedControls": "Consulta: Portugal TOP 10 - 2025 Paises mais Pacíficos do mundo com um  Rank 7/163, manteve em relação a 2024 (quanto menos o valor maior a pacificidade do país) (Fonte: http://visionofhumanity.org/indexes/global-peace-index/)"
  },
  {
    "id": "fd-2",
    "section": "SEGURANÇA GERAL",
    "criterion": "Risco de terroristas, criminosos, ou outro grupo organizado, afectarem a segurança da empresa e dos produtos fornecidos e/ou  produzidos",
    "implementedControls": null
  },
  {
    "id": "fd-3",
    "section": "SEGURANÇA GERAL",
    "criterion": "Risco de Protestantes, afectarem a segurança de forma a chamarem atenção por uma causa específica (Ex. Ambientalistas)",
    "implementedControls": null
  },
  {
    "id": "fd-4",
    "section": "SEGURANÇA GERAL",
    "criterion": "Risco de Sabotagem, incuindo algum interesse particular ou econômico (Ex. roubo de informações)",
    "implementedControls": null
  },
  {
    "id": "fd-5",
    "section": "SEGURANÇA GERAL",
    "criterion": "Risco de  EMPREGADOS OU TERCEIROS INSATISFEITOS: Pessoas dentro da organização, incluindo-se aqueles com algum tipo de distúrbio.",
    "implementedControls": null
  },
  {
    "id": "fd-6",
    "section": "SEGURANÇA GERAL",
    "criterion": "Histórico de atividades terroristas ou de sabotagem demostradas ao logo do tempo",
    "implementedControls": "Não há histórico"
  },
  {
    "id": "fd-7",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "O Exterior do edifício está controlado para impedir o acesso de pessoas não autorizadas?",
    "implementedControls": "1) A Fabrica encontra-se vedada e os portões apenas são abertos para acesso de cargas e descargas; 2) As câmaras de vigilância abrangem todo o perímetro exterior, inclusivé as bocas de descarga dos silos; 3) R-P8.3 - Check-List Mensal"
  },
  {
    "id": "fd-8",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "A vedação de protecção a toda a área da fábrica encontra-se em bom estado de conservação",
    "implementedControls": null
  },
  {
    "id": "fd-9",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "O perímetro da fábrica é periodicamente revisto de forma a verificar atividades suspeitas?",
    "implementedControls": null
  },
  {
    "id": "fd-10",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "Armazens ou outros edificios externos  ao edifício principal estão protegidos contra acessos não autorizados?",
    "implementedControls": null
  },
  {
    "id": "fd-11",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "Camaras de vigilância estão a funcionar correctamente?",
    "implementedControls": null
  },
  {
    "id": "fd-12",
    "section": "1.1. Proteção do exterior do edifício",
    "criterion": "Estado de Iluminação exterior do edificio para vigiar a fábrica durante a noite e detectar actividades suspeitas encontra-se conforme?",
    "implementedControls": null
  },
  {
    "id": "fd-13",
    "section": "1.2. Edificação e Estrutura",
    "criterion": "Toda a unidade industrial é constuida com materiais resistentes capazes de prevenir a entrada de intrusos?",
    "implementedControls": "1) O acesso ao perímetro externo da fabrica e ao seu interior é restrito aos colaboradores (código de acesso), e restrito ao horario de trabalho de cada um"
  },
  {
    "id": "fd-14",
    "section": "1.2. Edificação e Estrutura",
    "criterion": "Os pavimentos, paredes, tectos, portas e janelas encontram-se em bom estado de conservação (íntegros e sem falhas)?",
    "implementedControls": null
  },
  {
    "id": "fd-15",
    "section": "1.2. Edificação e Estrutura",
    "criterion": "Os portões, portas e janelas não permitem abertura através do exterior e/ou possuem alarme no caso de isso acontecer?",
    "implementedControls": null
  },
  {
    "id": "fd-16",
    "section": "1.2. Edificação e Estrutura",
    "criterion": "As portas de entrada e de saída do edifício têm algum mecanismo de controlo ou vigilância (fechadura, cadeado, outros mecanismos, excepto as saídas de emergência que não podem ser abertas pelo lado de fora)?",
    "implementedControls": null
  },
  {
    "id": "fd-17",
    "section": "1.2. Edificação e Estrutura",
    "criterion": "Pontos de acesso como por exemplo aberturas de ventilação garantem a segurança do edifício?",
    "implementedControls": null
  },
  {
    "id": "fd-18",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "A entrada na propriedade está controlada ou vigiada?",
    "implementedControls": "Controlada por controlo de acesso"
  },
  {
    "id": "fd-19",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Os veículos são inspecionados à entrada e saída por atividade suspeita?",
    "implementedControls": "Apenas os veículos autorizados acedem ao perímetro da Fábrica"
  },
  {
    "id": "fd-20",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Os veículos dos funcionários são facilmente identificáveis?",
    "implementedControls": "Apenas acedem os veiculos da direção."
  },
  {
    "id": "fd-21",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Todas as entradas de visistantes estão devidamente registadas, incluindo o nome do visitante, motivo de visita, data da visita?",
    "implementedControls": "R-M3.1 - Declaração de Responsabiliddae e Confidencialidade e R-M3.2"
  },
  {
    "id": "fd-22",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Todos os visitantes estão devidamente identificados enquanto permanecem na unidade industrial?",
    "implementedControls": "Apenas pessoal autorizado acede ao perímetro interior/exterior da fabrica e permanece devidamente acompanhado durante todo o tempo de permanência."
  },
  {
    "id": "fd-23",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Todos os visitantes são devidamente acompanhados dentro da unidade industrial?",
    "implementedControls": "Acomoanhados por algum funcionario"
  },
  {
    "id": "fd-24",
    "section": "1.3. Controlo de Acessos Exterior",
    "criterion": "Nas zonas de produção é assegurada a entrada somente a pessoas autorizadas?",
    "implementedControls": "As zonas restritas estão vedadas por controlo de acessos. As pessoal externas/visitas apenas acedem onde o responsável pelo sua visita der autorização"
  },
  {
    "id": "fd-25",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existe um Sistema de iluminação de emergência eficaz",
    "implementedControls": null
  },
  {
    "id": "fd-26",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existem Câmaras de vigilância no interior?",
    "implementedControls": null
  },
  {
    "id": "fd-27",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Todas as zonas de acesso restrito (zonas a que só os colaboradores têm acesso) estão claramente definidas e marcadas?",
    "implementedControls": null
  },
  {
    "id": "fd-28",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "As visitas e outras pessoas que não os empregados (prestadores de serviços, fornecedores, motoristas) têm acesso apenas a áreas onde não existe produto, a menos que acompanhados por um funcionário autorizado?",
    "implementedControls": "Prestadores de serviços, fornecedores e motoristas são tratados como VISITANTES"
  },
  {
    "id": "fd-29",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existe Controlo de acessos às àreas sensíveis da unidade industrial? As áreas restritas estão devidamente identificadas?",
    "implementedControls": "Todas as áreas restritas têm acesso vedado a px autorizado através de controlo de acessos"
  },
  {
    "id": "fd-30",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existe uma lista com os funcionários autorizados a entrar em determiadas áreas?",
    "implementedControls": "Os códigos de acesso às zonas restritas apenas são sedidos ao px autorizado. O código de acesso é individual e cada um é funcionário é responsável por este, sendo intransmissível. Cada funcionario assinou uma declaração de responsabilidade dos códigos que possui para acesso ás zonas restritas. R-P10.12(0) - termo de responsabilidade para controlo de acessos"
  },
  {
    "id": "fd-31",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existe algum plano de emergência e de alerta interno que é testado e revisto e tem os contactos de emergência (por exemplo, polícia ou bombeiros)?",
    "implementedControls": "Procedimento de P3-GESTÃO DE OCORRENCIAS"
  },
  {
    "id": "fd-32",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Há procedimentos para controlo de balneários, armários de limpeza, cacifos pessoais e zonas de armazenagem?",
    "implementedControls": "R-P8.3 - Check-List Mensal"
  },
  {
    "id": "fd-33",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Realizam-se inventários regulares das chaves de acesso a zonas protegidas e/ou críticas?",
    "implementedControls": "As zonas restritas são acedidas por controlo de acessos."
  },
  {
    "id": "fd-34",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Existe controlo de acesso ao sistema de ventilação/ar condicionado, armazenamento de água, energia eléctrica, entre outros?",
    "implementedControls": null
  },
  {
    "id": "fd-35",
    "section": "2.1. Controlo de Acessos Interior",
    "criterion": "Quando é detectada alguma ameaça potencial esta é registada e investigada de imediato?",
    "implementedControls": "P3 - GESTÃO DE OCORRENCIAS"
  },
  {
    "id": "fd-36",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Os motoristas não têm acesso ao interior das instalações e quando isso acontece a sua entrada é devidamente registada e a sua permanência acompanhada por um responsável.",
    "implementedControls": "Os motoristas não acedem ao interior das instalações e quando isso acontece são tratados como  VISITANTES"
  },
  {
    "id": "fd-37",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Todas as recepções de MP, material de embalagem, materiais subsidiários, são objecto de aviso/notificação?",
    "implementedControls": null
  },
  {
    "id": "fd-38",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Em caso de não conformidade na recepção de MP o fornecedor é sempre notificado?",
    "implementedControls": "Sempre que possível a mercadoria é devolvida de imediato, não se procedendo à recepção. Quando recepcionada MP NC é identificada, o fornecedor avisado e procede-se à devolução da mesma"
  },
  {
    "id": "fd-39",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Existe um funcionário específico e autorizado, com formação, que efectua a supervisão de todas as cargas e descargas da unidade industrial?",
    "implementedControls": null
  },
  {
    "id": "fd-40",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Os reboques dos camiões que se encontram no recinto ou fora do mesmo estão fechadas com chave ou seladas enquanto não são descarregados ou carregados?",
    "implementedControls": "Aquando a recepção são verificados os sitemas de anti-violação da carga"
  },
  {
    "id": "fd-41",
    "section": "2.2. Cargas e Descargas",
    "criterion": "Os camiôes cisterna que se encontram no recinto ou fora do mesmo estão fechados com chave ou estão selados enquanto não são descarregados ou carregados?",
    "implementedControls": null
  },
  {
    "id": "fd-42",
    "section": "2.2. Cargas e Descargas",
    "criterion": "A carga ou descarga de veículos que transportam matérias primas, produtos terminados ou outros materiais usados no processamento de materiais vigíam-se de perto?",
    "implementedControls": null
  },
  {
    "id": "fd-43",
    "section": "2.2. Cargas e Descargas",
    "criterion": "É garantida a segurança de contentores, galeras que fiquem dentro das instalações?",
    "implementedControls": null
  },
  {
    "id": "fd-44",
    "section": "2.2. Cargas e Descargas",
    "criterion": "É garantida a segurança das escotilhas dos camiões cisterna?",
    "implementedControls": "é efectuado o controlo visual e registado no R-P4.4"
  },
  {
    "id": "fd-45",
    "section": "2.2. Cargas e Descargas",
    "criterion": "É garantida a segurança de tanques de armazenamento a granel / Silos?",
    "implementedControls": null
  },
  {
    "id": "fd-46",
    "section": "2.2.1.  Procedimento de Food Defense para manipular as cargas que são expedidas?",
    "criterion": "Os carros são expedidos com selos que mostram intromissões indevidas?",
    "implementedControls": "As paletes são expedidas devidamente filmadas e identificadas por cliente final. Em caso de NC (paletes ou caixas danificadas) o cliente não recepciona o produto em causa."
  },
  {
    "id": "fd-47",
    "section": "2.2.1.  Procedimento de Food Defense para manipular as cargas que são expedidas?",
    "criterion": "O número do selo  dos carros expedidos é registado na documentação de transporte?",
    "implementedControls": null
  },
  {
    "id": "fd-48",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "O acesso à plataforma de cargas/descargas é controlado de forma a prevenir entregas não autorizadas ou não verificadas?",
    "implementedControls": "Só acedem às plataformas de carga/descrga veículos autorizados"
  },
  {
    "id": "fd-49",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "É requerida notificação prévia de todos os envios por parte dos fornecedores (telefone, fax, correio electrónico)?",
    "implementedControls": "Guias de transporte, Por e-mail"
  },
  {
    "id": "fd-50",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "As alterações suspeitas nos documentos de envio são investigadas de imediato?",
    "implementedControls": null
  },
  {
    "id": "fd-51",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Todos as recepções são verificadas na lista de entregas programadas?",
    "implementedControls": "Coincidência entre Nota de encomenda e Guia que acompanha mercadoria. Quando não há coincidência entre ambos, a mercadoria só é descarregada com autorização  do  responsável."
  },
  {
    "id": "fd-52",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "As entregas não programadas são mantidas fora do perímetro da instalação à espera de verificação?",
    "implementedControls": null
  },
  {
    "id": "fd-53",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Antes de se aceitar uma entrega fora do horário normal de laboração é recebido algum pedido prévio?",
    "implementedControls": "Quando a janela horária para descargas (09h-12h) ou dia de programado de entrega não consegue ser respeitado por algum motivo, o fornecedor entra em contacto com  o reponsável pela encomenda que coordena e averigua a possibilidade de descarga noutro horario."
  },
  {
    "id": "fd-54",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Quando se aceita que alguma entrega seja feita fora do horário laboral normal é requerida a presença de alguma pessoa autorizada que a verifique e recepcione?",
    "implementedControls": "As descargas são efectuadas em data previamente definida, permitindo que o responsável pela encomenda ou alguem da qualidade verifique a conformidade. O responsável pela descarga também tem formação para verificar a conformidade da mercadoria."
  },
  {
    "id": "fd-55",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Os carros que entregam cargas parciais são verificados e controlados?",
    "implementedControls": "Verifcada e confirmada a conformidade e estabilidade das paletes (correctamente filmadas) e embalagens do produto (devidamente seladas)"
  },
  {
    "id": "fd-56",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Os carros que dão entrada de matérias primas, materiais de embalagem ou outros materiais vêm selados com selos numerados ou outros dispositivos que demostram a existência de intrusão indevida (e o registo é feito na documentação)? Estes selos são verificados antes da recepção?",
    "implementedControls": "Apenas os carros cisterna, que transportam farinha a granel. Restantes viaturas procede-se conforme o ponto anterior."
  },
  {
    "id": "fd-57",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "As recepções de matérias primas, materiais de embalagem ou outros materiais são controladas nas plataformas de descarga para verificar a intergidade dos materiais e comprovar que não houve intrusões?",
    "implementedControls": null
  },
  {
    "id": "fd-58",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Os transportadores são seleccionados tendo em conta a sua capacidade de proteger os produtos que se enviam?",
    "implementedControls": "Empresas de trasporte certificadas"
  },
  {
    "id": "fd-59",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Os fornecedores de matérias primas tomam medidas para fortalecer a Food Defense nas suas instalações e durante o transporte?",
    "implementedControls": "Empresas de trasporte certificadas"
  },
  {
    "id": "fd-60",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Na selecção dos fornecedor de energia (gás, electricidade) e água, teve-se em conta se estes colocam em prática medidas gerais de segurança?",
    "implementedControls": "Empresas Nacionais: GALP, EDP, CM-Seia"
  },
  {
    "id": "fd-61",
    "section": "2.2.2. Procedimentos de Food Defense para gerir a descarga de materiais?",
    "criterion": "Na selecção dos fornecedor de materiais de embalagem secundários e etiquetas teve-se em conta se estes colocam em prática medidas gerais de segurança?",
    "implementedControls": "As medidas de segurança são concideradas na Avaliação e na classificação de fornecedores"
  },
  {
    "id": "fd-62",
    "section": "2.3. Procedimentos de Food Defense para as operações de produção",
    "criterion": "As linhas que manipulam e transferem ingredientes e/ou água estão vigiadas de forma a garantir a sua integridade?",
    "implementedControls": null
  },
  {
    "id": "fd-63",
    "section": "2.3. Procedimentos de Food Defense para as operações de produção",
    "criterion": "As sacas das matérias primas, antes de serem utilizadas, são inspecionadas para verificar se há provas de adulteração?",
    "implementedControls": null
  },
  {
    "id": "fd-64",
    "section": "2.3. Procedimentos de Food Defense para as operações de produção",
    "criterion": "Os registos são mantidos de forma a facilitar e permitir a rastreabilidade das matérias-primas até aos fornecedores?",
    "implementedControls": null
  },
  {
    "id": "fd-65",
    "section": "2.3. Procedimentos de Food Defense para as operações de produção",
    "criterion": "Os registos são mantidos de forma a facilitar e permitir a rastreabilidade dos produtos acabados até aos clientes?",
    "implementedControls": null
  },
  {
    "id": "fd-66",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O acesso a áreas de armazenamento de produtos, incluindo o armazenamento frio é limitado (p.e. através de portas/portões trancados, etc.) apenas para os funcionários designados?",
    "implementedControls": "Acesso restrito atravé de controlo de acessos"
  },
  {
    "id": "fd-67",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O acesso a zonas de armazenamento de matérias primas, material de embalagem e produto intermédio limita-se apenas a colaboradores designados?",
    "implementedControls": null
  },
  {
    "id": "fd-68",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O acesso a zonas de armazenamento de produtos acabados limita-se apenas a colaboradores designados?",
    "implementedControls": "Acesso restrito atravé de controlo de acessos"
  },
  {
    "id": "fd-69",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O acesso a instalações de armazenamento externo limita-se apenas a colaboradores designados?",
    "implementedControls": null
  },
  {
    "id": "fd-70",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "Realizam-se com regularidade inspecções de segurança de instalações de armazenamento?",
    "implementedControls": "R-P8.3 - Check-List Mensal"
  },
  {
    "id": "fd-71",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O inventário de ingredientes restritos é comparado regularmente com o uso real destes ingredientes?",
    "implementedControls": "Testes de Rastreabilidade e balanços mássicos"
  },
  {
    "id": "fd-72",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "A quantidade dos produtos (MP, ME, PI) é controlada de forma a evitar roubos ou manipulações indevidas?",
    "implementedControls": "Testes de Rastreabilidade e balanços mássicos"
  },
  {
    "id": "fd-73",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "As discrepâncias entre inventários de materiais (MP, ME, PI) são imediatamente investigadas e comunicadas ao pessoal adequado?",
    "implementedControls": "realização de inventários mensais por lote de MP"
  },
  {
    "id": "fd-74",
    "section": "2.4. Procedimentos de Food Defense para as zonas de armazenamento de MP",
    "criterion": "O stock de produtos acabados é monitorizado regularmente para verificar incorporações ou ausências que não se reflectem no stock existente?",
    "implementedControls": "Inventário de produtos finais realizado diariamente e efectuada confirmação com produto realemnte expedido"
  },
  {
    "id": "fd-75",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "O acesso ao armazenamento exterior ou interior de materiais ou substâncias quimicas como  produtos de limpeza e desinfectantes e produtos de manutenção está limitado apenas a funcionarios designados?",
    "implementedControls": "Produtos de manutenção, estão na zona de manutenção com controlo de acessos. Produtos de limpeza estão em dispensa fechada com chave na posse de funcionário designado"
  },
  {
    "id": "fd-76",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "A rotação de stocks é praticada (FEFO ou FIFO)?",
    "implementedControls": null
  },
  {
    "id": "fd-77",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "Mantém-se um inventário regular dos materiais e químicos?",
    "implementedControls": "Os produtos quimicos são comprados consoante as necessidades, cujas saídas são controladas através de requisições de material (R-M1.9)"
  },
  {
    "id": "fd-78",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "As discrepâncias entre inventários de materiais e químicos perigosos são imediatamente investigadas e comunicadas ao pessoal adequado?",
    "implementedControls": null
  },
  {
    "id": "fd-79",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "A zona de armazenamento de materiais perigosos ou substâncias químicas estão construídas e ventiladas de forma segura em conformidade com os requisitos legais aplicáveis?",
    "implementedControls": null
  },
  {
    "id": "fd-80",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "Há algum procedimento seguro para receber e guardar substâncias químicas perigosas?",
    "implementedControls": "Não são manipuladas substancias quimicas perigosas"
  },
  {
    "id": "fd-81",
    "section": "2.5. Procedimentos de Food Defense para o armazenamento de produtos quimicos",
    "criterion": "Há algum procedimento para controlar a eliminação de substâncias químicas perigosas?",
    "implementedControls": null
  },
  {
    "id": "fd-82",
    "section": "2.6. Procedimentos de Food Defense na entrada nas instalações de produto devolvido",
    "criterion": "Todos os produtos devolvidos são examinados na fábrica em local separado que permita procurar possiveis alterações antes de guardar o produto ou voltar a usar?",
    "implementedControls": "As devoluções são rececionados de acordo com o procedimento P-3(10) - GESTAO OCORRENCIAS"
  },
  {
    "id": "fd-83",
    "section": "2.6. Procedimentos de Food Defense na entrada nas instalações de produto devolvido",
    "criterion": "Há algum registo dos produtos devolvidos que são de novo utilizados?",
    "implementedControls": "R-P3.5(00) - Registo de devolução de produto acabado"
  },
  {
    "id": "fd-84",
    "section": "3.1. Controlo Analítico",
    "criterion": "É efectuado controlo microbiologico e/ou FQ de rotina às MP?",
    "implementedControls": "PL-P5.1 - Plano de Análises Externas"
  },
  {
    "id": "fd-85",
    "section": "3.1. Controlo Analítico",
    "criterion": "È efectuado controlo microbiológico e/ou FQ dos produtos finais?",
    "implementedControls": "PL-P5.1 - Plano de Análises Externas"
  },
  {
    "id": "fd-86",
    "section": "3.1. Controlo Analítico",
    "criterion": "È efectuado controlo microbiológico e/ou FQ da àgua?",
    "implementedControls": "PL-P5.1 - Plano de Análises Externas"
  },
  {
    "id": "fd-87",
    "section": "3.1. Controlo Analítico",
    "criterion": "È efectuado controlo microbiológico do ar ambiente?",
    "implementedControls": "PL-P5.1 - Plano de Análises Externas"
  },
  {
    "id": "fd-88",
    "section": "3.1. Controlo Analítico",
    "criterion": "Há algum procedimento para controlar as amostras recebidas de outras fábricas?",
    "implementedControls": "As amostras de fornecedores são recepcionadas sob autorização dos responsável pelo pedido. Todas as amostras têm documentação de acompanhamento (guia, FT)"
  },
  {
    "id": "fd-89",
    "section": "3.1. Controlo Analítico",
    "criterion": "O acesso ao laboratório interno é restrito a pessoal autorizado?",
    "implementedControls": "O acesso encontra-se restrito a pessoal autorizado. As amostras são controladas diariamente e Não existe registo de incidências de desaparecimento de amostras"
  },
  {
    "id": "fd-90",
    "section": "3.1. Controlo Analítico",
    "criterion": "O controlo de pragas infestantes é efectuado por uma empresa externa especializada?",
    "implementedControls": "Empresa Zecafil autorizada para o efeito"
  },
  {
    "id": "fd-91",
    "section": "3.1. Controlo Analítico",
    "criterion": "Os Meios de controlo possuem uma localização apropriada?",
    "implementedControls": null
  },
  {
    "id": "fd-92",
    "section": "3.1. Controlo Analítico",
    "criterion": "Os meios de controlo utilizados são apropriados ao sector alimentar?",
    "implementedControls": null
  },
  {
    "id": "fd-93",
    "section": "3.3. Videovigilância e Software",
    "criterion": "O acesso ao sistema está protegido por palavra passe?",
    "implementedControls": null
  },
  {
    "id": "fd-94",
    "section": "3.3. Videovigilância e Software",
    "criterion": "A sala dos servidores está protegida por algum mecanismo de detecção e/ou controlo de incêndios?",
    "implementedControls": "O acesso aos ecritórios, onde se encontram servidores, é restrito e controlado por controlo de acessos"
  },
  {
    "id": "fd-95",
    "section": "3.3. Videovigilância e Software",
    "criterion": "O sistema usa algum sistema de detecção de vírus e firewalls?",
    "implementedControls": null
  },
  {
    "id": "fd-96",
    "section": "3.3. Videovigilância e Software",
    "criterion": "Existem Câmaras de vigilância no interior e no exterior?",
    "implementedControls": null
  },
  {
    "id": "fd-97",
    "section": "3.3. Videovigilância e Software",
    "criterion": "As câmaras de vigilância estão direccionadas para as entradas das área consideradas mais sensíveis, como recepção, cargas e descargas, embalamento do produto final, acesso a escritórios es servidores de computadores?",
    "implementedControls": null
  },
  {
    "id": "fd-98",
    "section": "3.3. Videovigilância e Software",
    "criterion": "As linhas de produção são monotorizadas por videovigilância para garantir que não ocorrem contaminações intencionais do produto?",
    "implementedControls": null
  },
  {
    "id": "fd-99",
    "section": "3.3. Videovigilância e Software",
    "criterion": "O sistema de videovigilãncia é gerido através de computador?",
    "implementedControls": null
  },
  {
    "id": "fd-100",
    "section": "3.3. Videovigilância e Software",
    "criterion": "O acesso ao sistema de videovigilância é protegido por senha?",
    "implementedControls": null
  },
  {
    "id": "fd-101",
    "section": "4.1.  Procedimentos de Food Defense na Manutenção de equipamentos",
    "criterion": "Os equipamentos e utensílios de trabalho encontram-se em bom estado de conservação?",
    "implementedControls": null
  },
  {
    "id": "fd-102",
    "section": "4.1.  Procedimentos de Food Defense na Manutenção de equipamentos",
    "criterion": "Existe um plano de manutenção preventiva e o mesmo é cumprido?",
    "implementedControls": null
  },
  {
    "id": "fd-103",
    "section": "4.1.  Procedimentos de Food Defense na Manutenção de equipamentos",
    "criterion": "Todas as manutenções preventivas e correctivas são registadas. Após intervenção, é verificada a conformidade do equipamento e da sua higieniação?",
    "implementedControls": "R-P9.1 - REGISTO DE PEDIDO DE MANUTENÇÃO; Softwere com PLANO DE MANUTENÇÃO preventiva e registo de manutenções correctivas por equipamento"
  },
  {
    "id": "fd-104",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "O acesso aos depósitos de água é restrito (p.e. porta com fechadura e/ou acesso limitado a colabordores designados)?",
    "implementedControls": "A água é fornecida pela CM-Seia (AdSE). É controlada pela Fábrica do Pão internamente PL-P5.2 e externamente PL-P5.1"
  },
  {
    "id": "fd-105",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "O acesso a tanques de água potável é restrito?",
    "implementedControls": null
  },
  {
    "id": "fd-106",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "O acesso à estação de tratamento de água é restrito?",
    "implementedControls": null
  },
  {
    "id": "fd-107",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "O acesso a sistemas de reutilização de água é restrito (p.e. recuperação de condensados, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-108",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "As linhas de água potável são inspecionadas com regularidade de forma a detectar intromissões (p.e. inspecção visual da integridade física da infraestrutura, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-109",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "As linhas de água não potável são inspecionadas com regularidade de forma a detectar intromissões (p.e. inspecção visual da integridade física da infraestrutura, ligação às linhas de água potável, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-110",
    "section": "4.1.  Procedimentos de Food Defense que controlam o fornecimento de água",
    "criterion": "Foram tomadas medidas junto das autoridades locais de saúde para garantir a notificação imediata à fabrica de qualquer irregularidade que surja com o fornecimento de água?",
    "implementedControls": null
  },
  {
    "id": "fd-111",
    "section": "5. SEGURANÇA DA CORRESPONDÊNCIA/ENCOMENDAS",
    "criterion": "A manipulação da correspondência / encomendas é realizada numa divisão afastada das zonas de produção e embalagem?",
    "implementedControls": "O correio e encomendas, vêm de remetentes conhecidos e/ou direcconadas ao px responsável. São manipuladas na zona dos escritórios"
  },
  {
    "id": "fd-112",
    "section": "5. SEGURANÇA DA CORRESPONDÊNCIA/ENCOMENDAS",
    "criterion": "As pessoas responsáveis por receber o correio estão treinadas para reconhecer e manipular correspondência / encomendas suspeitas?",
    "implementedControls": null
  },
  {
    "id": "fd-113",
    "section": "5. SEGURANÇA DA CORRESPONDÊNCIA/ENCOMENDAS",
    "criterion": "A correspondência / encomendas suspeitas são encaminhadas e reportadas para as pessoas adequadas?",
    "implementedControls": null
  },
  {
    "id": "fd-114",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Para as novas contratações são verificados os antecedentes ou  referências antes da finalização do processo?",
    "implementedControls": null
  },
  {
    "id": "fd-115",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Todos os colaboradores da fábrica receberam formação nos procedimentos de segurança?",
    "implementedControls": "Aquando do seu acolhimento, são alertados e dadas instruções sobre como proceder em caso de falhas"
  },
  {
    "id": "fd-116",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Os funcionários são treinados para reportar atividades suspeitas ou presenças de pessoas estranhas não acompanhadas por colaboradores?",
    "implementedControls": null
  },
  {
    "id": "fd-117",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Dentro da instalação e em todas as situações os colaboradores, visitantes e prestadores de serviço têm alguma identificação consigo, ou são identificáveis facilmente?",
    "implementedControls": null
  },
  {
    "id": "fd-118",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Existe algum controlo de acessos à fábrica de colaboradores, visitas e prestadores de serviços nas horas laborais normais (p.e. portas codificadas, impressão digital, rececionista, cartão magnético, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-119",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "As visitas e prestadores de serviços encontram-se sempre acompanhadas?",
    "implementedControls": null
  },
  {
    "id": "fd-120",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Há alguma forma de identificar os colaboradores com as suas funções, responsabilidades ou departamentos específicos (p.e. uniformes codificados por cor)?",
    "implementedControls": "Todos os colaboradores estão identificados no seu posto de trabalho, através da roupa de trabalho"
  },
  {
    "id": "fd-121",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "A fábrica não permite a utilização de bens ou materiais pessoais na zona de produção?",
    "implementedControls": "IT-M1.2 - BPHF"
  },
  {
    "id": "fd-122",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Limita-se o que os colaboradores podem trazer para a fábrica?",
    "implementedControls": "Não está definido o que os colaboradores podem trazer para a Fabrica, mas está definido o que podem, ou não, ter dentro dos cacifos pessoais, e a proibição de levar objectos pessoais para a área de fabrico pelo que o risco de falha de segurança é muito reduzido. O controlo mensal realizado às areas de produção e cacifos permite averiguar desvios (R-P8.3)."
  },
  {
    "id": "fd-123",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Existe a prática de inspeccionar periodicamente os cacifos dos funcionário?",
    "implementedControls": "R-P8.3 - Check-List Mensal"
  },
  {
    "id": "fd-124",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "A lista de contactos dos colaboradores da fábrica está actualizada?",
    "implementedControls": null
  },
  {
    "id": "fd-125",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "A lista de contactos de emergência está actualizada?",
    "implementedControls": null
  },
  {
    "id": "fd-126",
    "section": "6. SEGURANÇA DO PESSOAL",
    "criterion": "Sempre que um funcionário deixa de colaborar na unidade industrial, essa informação é imediatamente disponibilizada aos recursos humanos e os acesos concedidos são imediatamente bloqueados?",
    "implementedControls": null
  },
  {
    "id": "fd-127",
    "section": "7.1. Procedimentos de Food Defense para identificar produtos adulterados",
    "criterion": "Em todos os produtos acabados é fácil detetar manipulações (selo de segurança, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-128",
    "section": "7.1. Procedimentos de Food Defense para identificar produtos adulterados",
    "criterion": "Não é possível aceder ao produto acabado sem rasgar o selo de segurança ou a embalagem que o contém?",
    "implementedControls": null
  },
  {
    "id": "fd-129",
    "section": "7.1. Procedimentos de Food Defense para identificar produtos adulterados",
    "criterion": "Em todos os materiais (ingredientes e embalagens em contacto directo com o produto) é fácil detetar manipulações (selo de segurança, etc.)?",
    "implementedControls": null
  },
  {
    "id": "fd-130",
    "section": "7.1. Procedimentos de Food Defense para identificar produtos adulterados",
    "criterion": "Não é possível aceder aos materiais (ingredientes e embalagens em contacto directo com o produto) sem rasgar o selo de segurança ou a embalagem que o contém?",
    "implementedControls": null
  },
  {
    "id": "fd-131",
    "section": "7.1. Procedimentos de Food Defense para identificar produtos adulterados",
    "criterion": "Todos os colaboradores da fábrica recebem formação na detecção de produtos adulterados e estão informados que devem comunicar a sua existência e não utilizá-los?",
    "implementedControls": null
  }
];

export const FOOD_DEFENSE_RISK_GUIDANCE = [
  { min: 6, label: 'Vulnerabilidade alta', action: 'Implementação imediata das medidas de controlo, no prazo máximo de 30 dias.' },
  { min: 3, label: 'Vulnerabilidade média', action: 'Planear medidas de controlo a curto ou médio prazo, até um ano.' },
  { min: 0, label: 'Vulnerabilidade baixa', action: 'Risco baixo; estudar medidas de melhoria da defesa.' },
] as const;
