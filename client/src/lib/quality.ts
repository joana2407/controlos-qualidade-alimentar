export const MODULES = [
  { id: "bphf", label: "Verificação de BPHF", shortLabel: "BPHF", description: "Higiene e boas práticas por área", color: "amber" },
  { id: "metal_detectors", label: "Verificação de detetores de metais", shortLabel: "Detetores", description: "Validação por linha e produto", color: "red" },
  { id: "sensory", label: "Controlo sensorial de produto acabado", shortLabel: "Sensorial", description: "Avaliação ponderada de produto acabado", color: "violet" },
  { id: "shelf_life", label: "Controlo de amostras em shelf-life", shortLabel: "Shelf-life", description: "Acompanhamento diário de amostras", color: "cyan" },
  { id: "monthly_checklist", label: "Checklist mensal por área", shortLabel: "Checklist", description: "Inspeção configurável por zona", color: "blue" },
  { id: "suggestion_boxes", label: "Verificação de caixas de sugestões", shortLabel: "Sugestões", description: "Recolha e triagem de registos", color: "lime" },
  { id: "fragile_items", label: "Verificação de quebráveis", shortLabel: "Quebráveis", description: "Inventário e inspeção de integridade", color: "orange" },
  { id: "dispatch_control", label: "Controlo à expedição", shortLabel: "Expedição", description: "Encomenda, rotulagem, quantidades e temperaturas", color: "teal" },
  { id: "internal_analysis", label: "Análises internas", shortLabel: "Análises", description: "Monitorização de alergénios por teste", color: "rose" },
  { id: "temperature_controls", label: "Controlos de Temperatura", shortLabel: "Temperaturas", description: "Verificação manual de equipamentos de congelação e frio", color: "sky" },
  { id: "food_defense", label: "Food Defense", shortLabel: "Food Defense", description: "Verificação anual de proteção contra atos intencionais", color: "amber" },
] as const;

export const BPHF_AREAS = ["Embalagem T", "Produção T", "Embalagem SG", "Produção SG"] as const;
export const METAL_AREAS = ["SG", "Tradicional 1", "Tradicional 2", "Granel", "Fábrica II"] as const;
export const SUGGESTION_LOCATIONS_BY_FACTORY = {
  F1_FATIADO: ["Caixa escritório", "Caixa WC feminino", "Caixa WC masculino"],
  F2_GRANEL: ["Caixa WC feminino", "Caixa WC masculino"],
  F3_SEM_GLUTEN: ["Caixa WC feminino", "Caixa WC masculino"],
} as const;

export function suggestionLocationsForFactory(factoryCode?: string) {
  return factoryCode ? SUGGESTION_LOCATIONS_BY_FACTORY[factoryCode as keyof typeof SUGGESTION_LOCATIONS_BY_FACTORY] ?? [] : [];
}
export const SENSORY_FIELDS = [
  { key: "aspeto", label: "Aspeto", weight: "10%" },
  { key: "fimDeBoca", label: "Fim de boca", weight: "15%" },
  { key: "cor", label: "Cor", weight: "15%" },
  { key: "cheiro", label: "Cheiro", weight: "10%" },
  { key: "textura", label: "Textura", weight: "10%" },
  { key: "sabor", label: "Sabor", weight: "40%" },
] as const;

export type QualityModule = (typeof MODULES)[number]["id"];

export function moduleLabel(module: string) {
  if (module === "not_applicable") return "Não aplicável";
  return MODULES.find((item) => item.id === module)?.label ?? module;
}

export function dateFormat(value: Date | string | number | null | undefined, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function datetimeLocalValue(date = new Date()) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
}
