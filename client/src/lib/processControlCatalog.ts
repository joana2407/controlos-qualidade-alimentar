export type ProcessFactoryId = 1 | 2 | 3;
export type ProcessPhase = 1 | 2 | 3;
export type ProcessCatalog = Record<string, { sheet: string; products: Record<string, Record<1 | 2 | 3, string[]>> }>;

export const PROCESS_CONTROL_CATALOG: ProcessCatalog = {
  "1": {
    "sheet": "Fábrica 1",
    "products": {
      "Broa de Milho": {
        "1": [
          "PESAGEM DE MP",
          "Escalda da farinha de milho juntamente com a restante MP, com exceção de T65 e a levedura: Vel. 1 durante 5 min",
          "Adição da farinha de trigo",
          "Amassadeira: 5 min na Vel. 1 e 10 min na Vel. 2"
        ],
        "2": [
          "Gramagem: 2,600kg",
          "Levadar à Temperatura ambiente: 30 min",
          "Forno: 245ºC e 255ºC, 35 a 45 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Centeio SERRÃO": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel. 1 e 10 a 15 min, Vel.2",
          "Estanca da Massa: 30 a 50 min",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 230ºC a 250ºC, 30 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalar",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Trigo SERRÃO": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min Vel. 1, 10 a 15 min Vel.2",
          "Estanca da Massa: 30 a 50 min",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 220ºC a 225ºC, 25 a 30 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Integral SERRÃO": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel. 1 e 10 a 15 min, Vel.2",
          "Estanca da Massa: 30 a 50 min na bacia",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 230ºC a 250ºC, 30 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Aveia SERRÃO": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel. 1 e 10 a 15 min, Vel.2",
          "Estanca da Massa: 30 a 50 min na bacia",
          "Gramagem: 0,950 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 220ºC a 225ºC, 20 a 30 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Multigrãos SERRÃO": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 10 a 15 min na Vel.2",
          "Estanca da Massa: 30 a 50 min na bacia",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 220ºC a 225ºC, 20 a 30 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Rústico Centeio": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 10 a 15 min na Vel.2",
          "Descansar 1h na bacia",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 225ºC a 230ºC, 25 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Rústico Mistura": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 10 a 15 min na Vel.2",
          "Descansar 1h na bacia",
          "Gramagem: 1,150 kg",
          "Colocar o topping",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 225ºC a 230ºC, 25 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Rústico Cereais": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 10 a 15 min na Vel.2",
          "Descansar 1h na bacia",
          "Gramagem: 1,150 kg",
          "Colocar o topping",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 225ºC a 230ºC, 25 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Rústico Trigo Alentejano": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 10 a 15 min na Vel.2",
          "Descansar 1h na bacia",
          "Gramagem: 1,150 kg",
          "Estufa: 1h a 1h10"
        ],
        "2": [
          "Forno: 225ºC a 230ºC, 25 a 35 min e dar banho de vapor (Forno 5, tolerância de 10 a 15ºC)",
          "Embalamento",
          "Rotulagem Correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Diabético": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel.1 e 15 min na Vel. 2",
          "Gramagem: 900g"
        ],
        "2": [
          "Quando acabar de tender colocar na estufa até massa estar pronta",
          "Forno: 225-235 ºC, 30 a 40 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Centeio Pingo Doce": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 5 min na Vel.2",
          "Gramagem: 0,600 kg",
          "Estufa até massa estar pronta",
          "Virar pão e pincelar local de hóstia e colocar a mesma"
        ],
        "2": [
          "Forno: 220ºC e 230ºC, 20 a 25 min",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Croutons": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 8 min Vel. 1 e 10 min Vel.2",
          "Gramagem: 800 g",
          "Moldar na formadora de baguetes: ovalado",
          "Estufa: 50 min"
        ],
        "2": [
          "Forno: 225 ºC, 20 min e dar banho de vapor",
          "Fatiar o pão com 3 cortes de forma a formar cubos",
          "Verter para sacos",
          "Dispor de uma camada de cubos em tabuleiros de forma a não ficaram sobrepostos",
          "Forno rotativo: 170-180ºC, 40 a 45 min",
          "Embalamento"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Multigrãos Congelado": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel.1 e 15 min, Vel. 2",
          "Gramagem: 1,100 kg"
        ],
        "2": [
          "Humedecer o pão e colocar misturar linhaça e girassol",
          "Estufa: até a massa estar \"pronta\"",
          "Forno: 220-230 ºC, 30 a 40 min e dar banho de vapor",
          "Desenfornar o Pão para os carros de arrefecimento"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Aveia Congelado": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel. 1 e 15 min, Vel. 2",
          "Gramagem: 0,900 kg"
        ],
        "2": [
          "Estufa: até a massa estar \"pronta\"",
          "Enfarinhar antes de tratamento térmico",
          "Forno: 225-230ºC, 25 a 35 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Centeio Congelado 350g": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel. 1 e 20 min na Vel. 2",
          "Gramagem: 0,950 kg",
          "Estufa: até estar \"pronta\""
        ],
        "2": [
          "Forno: 230-240 ºC, 25-35 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Trigo ITMP": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min na Vel.1 e 15 min na Vel. 2",
          "Gramagem:"
        ],
        "2": [
          "Estufa: até massa estar \"pronta\"",
          "Forno: 220-225ºC, 30-40 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Triga Milha ITMP": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min, Vel.1 e 20 min, Vel. 2",
          "Gramagem: 1,150 kg"
        ],
        "2": [
          "Descanso: 10 min e de seguida colocar na estufa até a massa estar pronta",
          "Enfarinhar com farinha de trigo",
          "Forno: 225-230ºC, 25 a 35 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Shape": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 10 min, exceto fermento",
          "Amassar: durante 10 min na Vel.1 e 15 a 20 min na Vel. 2",
          "Gramagem: 0,470 kg"
        ],
        "2": [
          "Colocar a decoração no topping do pão",
          "Colocar nas formas em 3 carros com cerca de 324 formas",
          "Estufa: 1h a 1h5",
          "Forno: a 210ºC, 37 a 40 min nos fornos rotativos, 20s de banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Trigo Massa Madre": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min Vel 1, 20 min Vel. 2",
          "Gramagem: 0,530 kg",
          "Estufa: 40 a 50 min"
        ],
        "2": [
          "Forno: 220-230 ºC, 15 a 25 min e dar banho de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Mama Mia": {
        "1": [
          "PESAGEM DE MP",
          "Misturar mix Mamma Mia com água e Baslight e hidratar 45 a 60 min",
          "Amassadeira: farinha de trigo e centeio e sal, 5 min à Vel. 10",
          "Gramagem: 0,600 kg"
        ],
        "2": [
          "Amassadeira: 20 a 25 min",
          "Estufa: 30 a 35 min",
          "Virar pão e pincelar local de hóstia e colocar a mesma",
          "Forno 5 a 240 ºC, 30 a 35 min e nos restantes fornos a 220ºC e 230ºC, 25 a 35 min",
          "Embalar",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Rústico de Trigo LIDL": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min Vel. 1, 10 a 15 min Vel.2",
          "Descansar 1h na bacia",
          "Gramagem: 1,150 kg"
        ],
        "2": [
          "Estufa: aprox. 1h a 1h10",
          "Forno: 225-230ºC, 25 a 35 min e dar banho de vapor",
          "Embalagem",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Multigrãos LIDL": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 5 min Vel.1 e 15 min na Vel. 2",
          "Gramagem: 1,150 kg"
        ],
        "2": [
          "Humedecer o pão e colocar misturar linhaça e girassol",
          "Estufa: até a massa estar \"pronta\"",
          "Forno: 220-230 ºC, 30 a 40 min e dar banho de vapor",
          "Embalagem",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      }
    }
  },
  "2": {
    "sheet": "Fábrica 2",
    "products": {
      "Broa Milho da Serra": {
        "1": [
          "PESAGEM DE MP",
          "Introdução da farinha de milho, sal e água a ferver",
          "Misturar: 25 minutos",
          "Arrefecimento: 3 horas"
        ],
        "2": [
          "Transferir massa escaldada para uma tina",
          "Adicionar restantes ingredientes 2 e amassar durante 15 minutos",
          "Tempo de repouso: 30 minutos",
          "Gramagem: 900 a 920 g",
          "Repouso: 10 a 20 minutos - verificar textura dos empelos",
          "Forno: 225-235ºC, 20-30 minutos",
          "Embalamento a granel",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Trigo Pão da Serra": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: farinha de trigo + massa mãe de centeio, sal, Hydrapan e GB fresh + 44L água/gelo e amassar 5 min na Vel. 1",
          "Amassadeira: Vel. 2 e água (6L) em 4 adições durante 6 a 8 minutos",
          "A 5 minutos do final adicionar a levedura",
          "Temperatura da massa: 20 a 24ºC - gelo",
          "Fermentação: uma hora e meia a duas horas"
        ],
        "2": [
          "Gramagem: 0,500 kg",
          "Colocar no Benetton bem enfarinhado",
          "Tempo de Repouso: 50-60min",
          "Forno: 235ºC a 245ºC, 20 a 30 min, e dar vapor prolongado no final de enfornar cada lar",
          "Abertura das portas 5 minutos antes de terminar a cozedura"
        ],
        "3": [
          "Embalamento a granel",
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Centeio da Serra": {
        "1": [
          "PESAGEM DE MP",
          "Verificação da Pesagem da Receita",
          "Amassamento: 5 minutos Vel.1 e 10 a 15 minutos na Vel.2 (+ ou - 3 minutos)",
          "Estanca da Massa: deixar a massa descansar  durante 30 a 50 min na bacia"
        ],
        "2": [
          "Verificação da gramagem do êmpelo: 0,700 kg",
          "Verificação do Tempo de Estufa: 1 hora - 1h10min",
          "Forno: 220º a 225ºC, 25 a 30 minutos, e dar banho de vapor",
          "Desenfornar o Pão para os carros de arrefecimento",
          "Embalamento a granel",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      }
    }
  },
  "3": {
    "sheet": "Fábrica 3 (SG)",
    "products": {
      "Mini Bolos de Arroz": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "MultiDrop: 0,045 kg",
          "Dispor 28 porções por tabuleiro"
        ],
        "2": [
          "Forno: 190-200ºC, 20-25 min",
          "Embalamento: 3 uni na base bolo de arroz papel fraft",
          "Flow pack: Filme BOPP 300 mm",
          "Rotulagem"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Mini Muffins Chocolate": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "Dispor mini tulipas de cor preto fosco nos tabuleiros de suporte de formas",
          "MultiDrop: 0,045 kg"
        ],
        "2": [
          "Forno: 190-200ºC, 25-30 min",
          "Arrefecimento e embalamento",
          "Embalamento: 3 unidades na base bolo de arroz papel fraft",
          "Flow pack: Filme BOPP 300 mm",
          "Rotulagem"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Mini Muffins Limão e Papoila": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "Dispor mini tulipas de cor preto fosco nos tabuleiros de suporte de formas",
          "MultiDrop: 0,045 kg"
        ],
        "2": [
          "Forno: 190-200ºC, 24-28 min",
          "Flow pack: BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolo Avó Laranja": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "Gramagem: 0,450 kg"
        ],
        "2": [
          "Forno:180 ºC, 38-42 min",
          "Embalamento: uma unidade por base de bolo da avó",
          "Flow pack: Filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolo Avó Chocolate": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "Gramagem: 0,450 kg"
        ],
        "2": [
          "Forno: 180 ºC, 38 a 42 min",
          "Embalamento: uma unidade por base de bolo da avó",
          "Flow pack: Filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolo Avó Mármore": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "Gramagem: 0,450 kg"
        ],
        "2": [
          "Forno: 180 ºC, 38-42 min",
          "Embalamento: uma unidade por base de bolo da avó",
          "Flow pack: Filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Biscoitos Originais": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "MultiDrop: 0,030 kg",
          "Dispor 28 porções por tabuleiro"
        ],
        "2": [
          "Forno: 190ºC a 200ºC, 15 a 20 min",
          "Embalamento: 5 uni na base bolo de arroz em papel kraft",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Biscoitos Canela": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "MultiDrop: 0,030 kg",
          "Dispor 28 porções por tabuleiro"
        ],
        "2": [
          "Forno: 190ºC a 200ºC, 15 a 20 min",
          "Embalamento: 5 unidades na base bolo de arroz em papel kraft",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Biscoitos Laranja": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel.5",
          "MultiDrop: 0,030 kg",
          "Dispor 28 porções por tabuleiro"
        ],
        "2": [
          "Forno: 190ºC a 200ºC, 15 a 20 min",
          "Embalamento: embalar 5 unidades na base bolo de arroz em papel kraft",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Almendrados": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: à Vel. 8 durante 8 min - Margarina",
          "Batedeira: secos + margarina, à Vel. 1 durante 30 seg",
          "Batedeira: ovo e bater à Vel. 1, 1 a 2 minutos",
          "MultiDrop: 0,030 kg",
          "Dispor 28 porções por tabuleiro"
        ],
        "2": [
          "Forno: 215 ºC: 1 carro - 13 min; 2 carros - 17 min",
          "Embalamento: 5 uni na base tostas 2 em papel kraft",
          "Flow-pack: Filme BOPP 300 mm"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Grissinos Simples": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 4 min à Vel. 5",
          "Dispor a massa em tabuleiros e cortar em parcelas iguais com um cortador próprio para o efeito"
        ],
        "2": [
          "Forno: 215 ºC e 220 ºC, 27 a 32 min, banho de vapor de 20 seg",
          "Após arrefecimento colocar cerca de 17 grissinos na pastel côco",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Grissinos Sésamo": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 4 min à Vel. 5",
          "Dispor a massa em tabuleiros e cortar em parcelas iguais com um cortador próprio para o efeito"
        ],
        "2": [
          "Forno: 215 ºC e 220 ºC, 27 a 32 min, banho de vapor de 20 seg",
          "Após arrefecimento colocar cerca de 17 grissinos na pastel côco",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Tostas Mistura": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 5 min na Vel. 1 + 5 min na Vel. 2",
          "Gramagem: 0,320 kg"
        ],
        "2": [
          "Estufa: 30 a 45 min, banho de vapor 25 seg",
          "Forno: 230ºC e 240ºC, 25 a 30 min, banho de vapor 25 seg",
          "Desidratar: 160ºC, 50 min",
          "Embalmento: 17 fatias na base tostas",
          "Flow-pack: Filme BOPP 360 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Tostas Multicereais": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 5 min, na Vel. 1 + 5 min, na Vel. 2",
          "Gramagem: 0,320 kg"
        ],
        "2": [
          "Estufa: 30 a 45 min, banho de vapor 25 seg",
          "Forno: 230ºC e 240ºC, 25 a 30 min, banho de vapor 25 seg",
          "Desidratar: 160ºC, 50 min",
          "Embalamento: 17 fatias na base tostas",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Tostas Tomate e Oregãos": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 5 min, na Vel. 1 + 5 min, na Vel. 2",
          "Gramagem: 0,320 kg"
        ],
        "2": [
          "Estufa: 30 a 45 min, banho de vapor 25 seg",
          "Forno: 230ºC e 240ºC, 25 a 30 min, banho de vapor 25 seg",
          "Desidratar: 160ºC, 50 min",
          "Embalamento: 17 fatias na base tostas",
          "Flow-pack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Broa De Milho": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 4 min, na Vel. 1 + 4 min, na Vel. 2",
          "Gramagem: 0,500 kg"
        ],
        "2": [
          "Aguardar cerca de 5 a 10 min e enfornar",
          "Forno: 250ºC, 30 seg de vapor, 22 a 30 min",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Fatias Pão Branco": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 3 a 4 min, na Vel. 1 + 4 a 5 min, na Vel. 2",
          "Gramagem: 0,500 kg"
        ],
        "2": [
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Fatias Pão 5 Sementes": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 3 a 4 min, na Vel. 1 + 4 a 5 min, na Vel. 2",
          "Gramagem: 0,500 kg"
        ],
        "2": [
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Forma Escuro": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 3 a 4 min, na Vel. 1 + 4 a 5 min, na Vel. 2",
          "Gramagem: 0,400 kg"
        ],
        "2": [
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Forma Branco": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 3 a 4 min, na Vel. 1 + 4 a 5 min, na Vel. 2",
          "Gramagem: 0,400 kg"
        ],
        "2": [
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Forma 5 Sementes": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 3 a 4 min, na Vel. 1 + 4 a 5 min, na Vel. 2",
          "Gramagem: 0,400 kg"
        ],
        "2": [
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Salsicharia": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: água e a levedura até total dissolução da levedura + restantes ingredientes",
          "Batedeira: 5 min Vel. 1 e 20 min na Vel. 2",
          "Gramagem: 1,200 kg",
          "Estufa: Sem conservantes - 40-45 min na estufa; Com Conservantes - 25 a 30 min na estufa"
        ],
        "2": [
          "Forno: 230-240ºC, 35-40 min, 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Ló": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 11-14 min à Vel. 20",
          "Gramagem: 0,220 kg",
          "Colocar as formas"
        ],
        "2": [
          "Forno: 190-200ºC, 23-28 min",
          "Embalamento: Flow pack filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Ló Chocolate": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 11-14 min à Vel. 20",
          "Gramagem: 0,240 kg",
          "Colocar as formas"
        ],
        "2": [
          "Forno: 190-200ºC, 23-28 min",
          "Embalamento: Flow pack filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Folar": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: margarina e acúcar à Vel. 10, 8 min",
          "Batedeira: restantes ingredientes, Vel. 1 - 5 min e Vel.2 - 2min",
          "Gramagem: 0,450 kg"
        ],
        "2": [
          "Forno: 180-190ºC, 41 a 46 min",
          "Embalamento: FlowPack - filme BOPP 460 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Ló Húmido": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 12 min - Vel. 20 e 2 min - Vel. Menos"
        ],
        "2": [
          "Forno: 230 ºC, 11 a 19 min",
          "Flow pack: filme BOPP 490 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolo Rei": {
        "1": [
          "PESAGEM DE MP",
          "Colocação das sultanas no vinho do porto",
          "Juntar ovo, óleo, margarina com o açúcar e os aromas na amassadeira. Envolver.",
          "Colocar a farinha, fermento, e conservantes e começar a amassar na Vel. 2",
          "Adicionar frutos secos e as sultanas",
          "Amassar: 3 min Vel. 1 e 7 min Vel. 2"
        ],
        "2": [
          "Colocar na pesadora e tender: enrolar e moldar manualmente",
          "Colocar 5 unidades por tabuleiro e borrifar com ovo líquido",
          "Decorar com frutos secos",
          "Enfornar a 180 ºC e cozer durante 44 a 48 min",
          "Pintar os bolos com calda de açúcar previamente preparada",
          "Calda de açúcar: 600mL com 1kg de açúcar em lume"
        ],
        "3": [
          "Embalamento na FlowPack",
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolo Rainha": {
        "1": [
          "PESAGEM DE MP",
          "Colocação das sultanas no vinho do porto",
          "Juntar ovo, óleo, margarina com o açúcar e os aromas na amassadeira. Envolver.",
          "Colocar a farinha, fermento, e conservantes e começar a amassar na Vel. 2"
        ],
        "2": [
          "Adicionar frutos secos e as sultanas",
          "Amassar: 3 min Vel. 1 e 7 min Vel. 2",
          "Colocar na pesadora e tender: enrolar e moldar manualmente",
          "Colocar 5 unidades por tabuleiro e borrifar com ovo líquido",
          "Decorar com frutos secos",
          "Enfornar a 180 ºC e cozer durante 44 a 48 min",
          "Pintar os bolos com calda de açúcar previamente preparada",
          "Calda de açúcar: 600mL com 1kg de açúcar em lume"
        ],
        "3": [
          "Embalamento na FlowPack",
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolinhas Brancas DF": {
        "1": [
          "PESAGEM DE MP",
          "Misturar a água, levedura e óleo até total dissolução da levedura",
          "Amassadeira: 4 min - Vel. 1; 4 - min - Vel. 2"
        ],
        "2": [
          "MultiDrop: 0,070 kg",
          "Colocar em tabuleiros de rede: 6x5 bolas/tabuleiro; 6x4 bolas/tabuleiro",
          "Estufa: 15 a 20 min",
          "Forno: 240 ºC, 24 a 26 min, com 25 seg vapor",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolinha Alfarroba DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: misturar água, levedura e óleo até total dissolução da levedura",
          "Batedeira: adicionar restantes ingredientes à mistura + 3 min - Vel.1 e 4 min - Vel.2"
        ],
        "2": [
          "Bater: 4 min Vel. 3",
          "Multidrop: 55 a 65 g",
          "Colocar em tabuleiros de rede: 6x5 bolas/tabuleiro; 6x4 bolas/tabuleiro",
          "Forno 1 - 240ºC - 18 a 20 min; Forno 2: durante 20 a 23 min, c/ 25 seg.",
          "Embalamento na FlowPack",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Baguete Branca DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: misturar água, levedura e óleo até total dissolução da levedura",
          "Batedeira: adicionar restantes ingredientes à mistura + 4 min - Vel.1 e 4 min - Vel.2"
        ],
        "2": [
          "Multidrop: 150 a 170g",
          "Colocar em tabuleiros de rede: 15 baguetes por tabuleiro",
          "Forno: 240 ºC, 24 a 27 min, com 25 seg vapor",
          "Embalamento individual",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolinha 5 Sementes DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: misturar água, levedura e óleo até total dissolução da levedura",
          "Batedeira: adicionar restantes ingredientes à mistura + 3 min - Vel.1 e 4 min - Vel.2"
        ],
        "2": [
          "Batedeira: 4 min Vel. 3",
          "Multidrop: 50 a 70 g",
          "Colocar em tabuleiros de rede: 6x5 bolas/tabuleiro; 6x4 bolas/tabuleiro",
          "Forno: 240ºC, 18 a 20 min Forno 1; 20 a 23 min Forno 2, c/ 25 seg vapor",
          "Embalamento individual",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Baguete 5 Sementes DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: misturar água, levedura e óleo até total dissolução da levedura",
          "Batedeira: adicionar restantes ingredientes à mistura + 3 min - Vel.1 e 4 min - Vel.2"
        ],
        "2": [
          "MultiDrop: 150 a 170 g",
          "Colocar topping de sementes",
          "Colocar em tabuleiro de rede 15 baguetes",
          "Forno: 240 ºC, 24-27 min, c/ 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Brioche DF": {
        "1": [
          "PESAGEM DE MP",
          "Misturar todos os ingredientes, 3 min Vel. 1 e 4 min Vel. 2",
          "Multidrop: 100 a 120 g",
          "Colocar 24 unidades por tabuleiro de teflon"
        ],
        "2": [
          "Estufa: 30 min",
          "Forno: 200 ºC, 25-28 min",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão Saloio DF": {
        "1": [
          "PESAGEM DE MP",
          "Misturar água, levedura e óleo até dissolução da levedura",
          "Pesar todos os ingredientes e juntar na batedeira",
          "Batedeira: 4 min a Vel. 1 e 4 min a Vel. 2"
        ],
        "2": [
          "Gramagem: 0,600 kg",
          "Moldar e colocar em tabuleiros: 5 uni por tabuleiro",
          "Estufa: 20 a 30 min",
          "Virar o pão antes de enfornar",
          "Forno: 230ºC durante 28-32 min, 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pão de Forma DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: misturar água, levedura e óleo até total dissolução da levedura",
          "Pesar os ingredientes e adicionar à mistura",
          "Batedeira: 3 min Vel.1 e 4 min Vel. 2"
        ],
        "2": [
          "Gramagem: 0,450 kg",
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 32-35 min, 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Simples DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: óleo, ovos e açúcar - 5 min à Vel. 1",
          "Batedeira: farinha, fermento - 2 min à Vel.1",
          "Tulipas de cor castanha"
        ],
        "2": [
          "Multidrop: 0,100 kg",
          "Forno: 35-40 min, 190ºC",
          "Embalar na Flowpack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Frutos Vermelhos DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: óleo, ovos e açúcar - 5 min na Vel. 1",
          "Batedeira: 2 min a Vel.1",
          "Tulipas de cor vermelha"
        ],
        "2": [
          "Multidrop: 0,100 kg",
          "Forno: 35-40 min, 190ºC",
          "Recheio: frutos vermelhos 10 a 12,5g por bolo",
          "Embalar na Flowpack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Chocolate DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 3 min Vel. 5",
          "Tulipas de cor lilás"
        ],
        "2": [
          "Multidrop: 0,100 kg",
          "Forno: 35-40 min, a 190ºC",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Limão e Papoila DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 3 min Vel. 5",
          "Tulipas Preto Fosco"
        ],
        "2": [
          "Multidrop: 0,100 kg",
          "Forno: 35-40 min, 190ºC",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Pastel de Nata DF": {
        "1": [
          "PESAGEM DE MP",
          "Misturar e amassar todos os ingredientes da massa para o pastel",
          "Tender na multidrop em porções na gramagem definida",
          "Colocar em formas de alumínio"
        ],
        "2": [
          "Abril o pastel de nata na prensa",
          "Dispor 24 unidades por tabuleiro",
          "Mistura 1: Aquecer o leite com aúcar, aroma de limão e paus de canela",
          "Mistura 2: Dissolver amido com porção de leite frio",
          "Depois de ferver o leite misturar com a Mistura 2",
          "Arrefecer",
          "Juntar as gemas e envolver",
          "Encher as formas com auxilio da recheadora",
          "Cozer a 215 ºC durante 24-30 min"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Mini Muffins Chocolate DF": {
        "1": [
          "PESAGEM DE MP",
          "Pesagem correta dos ingredientes e juntar na batedeira",
          "Batedeira: 2 a 3 min na Vel. 5",
          "Multidrop: 0,045 kg"
        ],
        "2": [
          "Dispor mini tulipas de cor preto fosco nos tabuleiros de suporte de formas tipo tulipas",
          "Forno: 190-200 ºC, 25 a 30 min",
          "Embalamento"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Mini Bolos de Arroz DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel. 5",
          "Multidrop: 0,045 kg"
        ],
        "2": [
          "Dispor 28 porções por tabuleiro",
          "Forno: 190-200 ºC, 20 a 25 min",
          "Embalamento"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Mini Muffins Limão e Papoila DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 2-3 min, Vel. 5",
          "Multidrop: 0,045 kg"
        ],
        "2": [
          "Mini tulipas de cor preto amarelo",
          "Forno: 190-200 ºC, 24 a 28 min",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Croissants Vegan DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 3 min na Vel. 1, e 4 min na Vel. 2",
          "Repouso: 5 min",
          "Laminar a massa"
        ],
        "2": [
          "Gramagem: 100 a 110g",
          "Colocar em tabuleiros de rede: 5x4 - 20 croissant por tabuleiro; 4x4 - 16 croissaint por tabuleiro",
          "Estufa:1h",
          "Forno: 200ºC, 20 a 22 min",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Croissants Brioche DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 4 min na Vel.1 e 4 min na Vel.2",
          "Laminar a massa",
          "Gramagem: 100 a 120g"
        ],
        "2": [
          "Colocar em tabuleiros de rede: 4x3 - 12 croissaint por tabuleiro",
          "Estufa: 1h a 1h30",
          "Pulverizar os croissaints com ovo líquido",
          "Forno: 160ºC, 28 a 35 min"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Bolinhas Brioche DF": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 4 min na Vel. 1 e 4 min na Vel. 2",
          "Multidrop: 80 a 90g",
          "Colocar 15 uni por tabuleiro teflon"
        ],
        "2": [
          "Estufa: 30 min",
          "Pulverizar com Ovo Líquido",
          "Forno: 160 ºC, 26-30 min",
          "Flowpack: filme BOPP 300mm"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Panquecas DF": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: 3 min Vel 1. e 4 min na Vel.10",
          "Repouso: 5 a 10 min",
          "Pulverizar os tabuleiros de teflon com desmoldante"
        ],
        "2": [
          "MultiDrop (24 uni por tabuleiro):  38 a 40 g",
          "Forno: 230 ºC, 10 a 12 min",
          "FlowPack: Filme BOPP 300 mm",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Fatias Pão Forma Rústico DF": {
        "1": [
          "PESAGEM DE MP",
          "Misturar a água, levedura e óleo até total dissolução da levedura",
          "Batedeira: 3-4 min na Vel. 1 e 4-5 min na Vel. 2"
        ],
        "2": [
          "Gramagem: 0,450 kg",
          "Estufa: 30-35 min",
          "Forno: 230ºC a 240ºC, 30-35 min, 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Fatias Pão Forma Branco DF": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 3 min à Vel. 1 e 4 min à Vel. 2"
        ],
        "2": [
          "Gramagem: 0,450 kg",
          "Estufa: 30-35 min",
          "Forno: 230-240ºC, 32-35 min, com 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Fatias Pão Forma 5 Sementes DF": {
        "1": [
          "PESAGEM DE MP",
          "Amassadeira: 3 a 4 min a Vel. 1 e 4 a 5 min a Vel. 2"
        ],
        "2": [
          "Gramagem: 0,400 kg",
          "O pão é humedecido e decorado com a mistura de linhaça e girassol",
          "Estufa: 30 a 35 min",
          "Forno: 230-240ºC, 30-35 min, com 25 seg vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Simples Panidor": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: ovo, água e óleo durante 2 min à Vel. 2",
          "Batedeira: adicionar muffin mix gluten free, 5 min à Vel. 2",
          "Tulipas cor beje"
        ],
        "2": [
          "Gramagem: 0,095 kg",
          "Forno: 35 min, 190ºC, e a faltaram 30 min de forno adicionar 5 seg de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Chocolate Panidor": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: ovo, água e óleo, 2 min à Vel. 2",
          "Batedeira: muffin mix gluten free, 5 min à Vel. 2",
          "Dispor tulipas cor beje nos tabuleiros de suporte para tulipas"
        ],
        "2": [
          "Gramagem: 0,095 kg",
          "Forno: 35 min a 190ºC, e a faltaram 30 min de forno adicionar 5 seg de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      },
      "Muffins Papoila e Limão Panidor": {
        "1": [
          "PESAGEM DE MP",
          "Batedeira: ovo, água e óleo durante 2 min à Vel. 2",
          "Batedeira: adicionar muffin mix gluten free, 5 min à Vel. 2",
          "Tulipas cor beje"
        ],
        "2": [
          "Gramagem: 0,095 kg",
          "Forno: 35 min, 190ºC e a faltaram 30 min de forno adicionar 5 seg de vapor",
          "Embalamento",
          "Rotulagem correta"
        ],
        "3": [
                    "Nº Quebras",
          "Nº Sobras",
          "Nº Cx Massa"
        ]
      }
    }
  }
};

export const PROCESS_FACTORY_LABELS: Record<string, string> = { "1": "Fábrica 1 · Fatiado", "2": "Fábrica 2 · Granel", "3": "Fábrica 3 · SG" };
export const PROCESS_PHASE_LABELS: Record<string, string> = { "1": "Fase inicial", "2": "Fase de produção", "3": "Fase final" };
