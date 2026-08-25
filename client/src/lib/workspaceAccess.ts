import type { QualityOperatorProfile } from "@/contexts/QualityAccessContext";

export type WorkspaceKey = "quality" | "occurrences";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function canAccessWorkspace(profile: QualityOperatorProfile | null | undefined, workspace: WorkspaceKey) {
  if (!profile) return false;
  const name = normalize(profile.name);
  if (workspace === "quality") return ["sabrina esteves", "neuza antunes", "joana pina", "gestao", "gestão"].includes(name);
  return name === "sabrina esteves" || name === "joana pina" || name === "nuno" || name.startsWith("nuno ") || name === "gestao" || name === "gestão" || normalize(profile.title).includes("gestao");
}
