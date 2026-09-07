export const QUALITY_PANEL_OPTIONS = [
  { key: "dashboard", label: "Painel Hoje", description: "Tarefas, pendências e estado diário." },
  { key: "platform", label: "Plataforma", description: "Orientações e explicação dos módulos." },
  { key: "operational_controls", label: "Controlos Operacionais", description: "Painel geral e formulários dos controlos de produção." },
  { key: "incidents", label: "Incidências", description: "Registo e acompanhamento de incidências." },
  { key: "reports", label: "Relatórios", description: "Consulta e exportação de registos." },
  { key: "analytics", label: "Análise operacional", description: "Indicadores e gráficos de desempenho." },
  { key: "backups", label: "Backups diários", description: "Consulta de arquivos operacionais." },
  { key: "rd_sensory", label: "I&D — controlo sensorial", description: "Projetos e avaliações sensoriais de I&D." },
] as const;

export type QualityPanelKey = (typeof QUALITY_PANEL_OPTIONS)[number]["key"];

export const QUALITY_PANEL_KEYS = QUALITY_PANEL_OPTIONS.map(panel => panel.key) as QualityPanelKey[];

export function isQualityPanelKey(value: string): value is QualityPanelKey {
  return QUALITY_PANEL_KEYS.includes(value as QualityPanelKey);
}

export function panelsForQualityPath(pathname: string): QualityPanelKey | null {
  if (pathname === "/" || pathname === "/qualicontrol") return "dashboard";
  if (pathname === "/plataforma" || pathname === "/ajuda") return "platform";
  if (pathname === "/controlos" || pathname.startsWith("/controlos/")) return "operational_controls";
  if (pathname === "/incidencias" || pathname === "/nao-conformidades") return "incidents";
  if (pathname === "/relatorios") return "reports";
  if (pathname === "/analise-operacional") return "analytics";
  if (pathname === "/backups-diarios") return "backups";
  if (pathname === "/id-sensorial") return "rd_sensory";
  return null;
}

export function hasQualityPanelAccess(role: "technician" | "manager" | "viewer", allowedPanels: QualityPanelKey[] | null | undefined, panel: QualityPanelKey | null) {
  if (role === "manager" || panel === null) return true;
  return (allowedPanels ?? QUALITY_PANEL_KEYS).includes(panel);
}
