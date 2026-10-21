export const QUALITY_PANEL_OPTIONS = [
  { key: "dashboard", label: "Painel Hoje", description: "Tarefas, pendências e estado diário." },
  { key: "platform", label: "Plataforma", description: "Orientações e explicação dos módulos." },
  { key: "operational_controls", label: "Controlos Operacionais", description: "Painel geral e formulários dos controlos de produção." },
  { key: "incidents", label: "Incidências", description: "Registo e acompanhamento de incidências." },
  { key: "reports", label: "Relatórios", description: "Consulta e exportação de registos." },
  { key: "analytics", label: "Análise operacional", description: "Indicadores e gráficos de desempenho." },
  { key: "backups", label: "Backups diários", description: "Consulta de arquivos operacionais." },
] as const;

export const QUALITY_EXTERNAL_PANEL_OPTIONS = [
  { key: "occurrences", label: "Gestão de Ocorrências", description: "Acesso ao painel externo de ocorrências." },
  { key: "raw_materials", label: "Gestão de MP", description: "Acesso ao painel externo de matérias-primas." },
  { key: "sensory_control", label: "Controlo Sensorial", description: "Acesso ao painel externo de controlo sensorial." },
  { key: "artisan_rd", label: "I&D · Artisan", description: "Acesso ao painel externo de I&D Artisan." },
  { key: "calibration", label: "Plano de Calibração", description: "Acesso ao painel externo de calibração." },
  { key: "maintenance", label: "Plano de Manutenção", description: "Acesso ao painel externo de manutenção." },
  { key: "production_breakdowns", label: "Quebras de produção", description: "Acesso aos painéis externos de quebras das fábricas." },
] as const;

export type QualityPanelKey = (typeof QUALITY_PANEL_OPTIONS)[number]["key"];
export type QualityExternalPanelKey = (typeof QUALITY_EXTERNAL_PANEL_OPTIONS)[number]["key"];

export const QUALITY_PANEL_KEYS = QUALITY_PANEL_OPTIONS.map(panel => panel.key) as QualityPanelKey[];
export const QUALITY_EXTERNAL_PANEL_KEYS = QUALITY_EXTERNAL_PANEL_OPTIONS.map(panel => panel.key) as QualityExternalPanelKey[];

export function isQualityPanelKey(value: string): value is QualityPanelKey {
  return QUALITY_PANEL_KEYS.includes(value as QualityPanelKey);
}

export function isQualityExternalPanelKey(value: string): value is QualityExternalPanelKey {
  return QUALITY_EXTERNAL_PANEL_KEYS.includes(value as QualityExternalPanelKey);
}

export function panelsForQualityPath(pathname: string): QualityPanelKey | null {
  if (pathname === "/" || pathname === "/qualicontrol") return "dashboard";
  if (pathname === "/plataforma" || pathname === "/ajuda") return "platform";
  if (pathname === "/controlos" || pathname.startsWith("/controlos/") || pathname === "/checklist-processos") return "operational_controls";
  if (pathname === "/incidencias" || pathname === "/nao-conformidades") return "incidents";
  if (pathname === "/relatorios") return "reports";
  if (pathname === "/analise-operacional") return "analytics";
  if (pathname === "/backups-diarios") return "backups";
  return null;
}

export function hasQualityPanelAccess(role: "technician" | "manager" | "viewer", allowedPanels: QualityPanelKey[] | null | undefined, panel: QualityPanelKey | null) {
  if (role === "manager" || panel === null) return true;
  return (allowedPanels ?? QUALITY_PANEL_KEYS).includes(panel);
}

export function hasQualityExternalPanelAccess(role: "technician" | "manager" | "viewer", allowedPanels: QualityExternalPanelKey[] | null | undefined, panel: QualityExternalPanelKey) {
  if (role === "manager") return true;
  return (allowedPanels ?? QUALITY_EXTERNAL_PANEL_KEYS).includes(panel);
}
