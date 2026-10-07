import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync("server/routers/quality.ts", "utf8");
const controls = readFileSync("client/src/pages/Controls.tsx", "utf8");
const incidences = readFileSync("client/src/pages/Nonconformities.tsx", "utf8");

describe("contexto da incidência nos seguimentos", () => {
  it("devolve os dados da incidência de origem na tarefa de seguimento", () => {
    expect(router).toContain("function incidenceOriginFrom(");
    expect(router).toContain('textValue("collaboratorName", "inspectedCollaborator")');
    expect(router).toContain("collaboratorNames.get(collaboratorId)");
    expect(router).toContain("productName: textValue(\"product\", \"productName\")");
    expect(router).toContain("evidencePhotos: verificationEvidencePhotos(payload)");
    expect(router).toContain("incidenceOrigin");
    expect(router).toContain("listIncidenceFollowUpTasks");
    expect(router).toContain("sourceEntryId: task.sourceEntryId ?? null");
  });

  it("mostra colaborador e restantes dados no painel Hoje e no detalhe da incidência", () => {
    expect(controls).toContain("Colaborador avaliado:");
    expect(controls).toContain("Incidência de origem");
    expect(controls).toContain("Abrir verificação original");
    expect(controls).toContain("Evidência da incidência de origem");
    expect(incidences).toContain("Dados da incidência que originou o seguimento");
    expect(incidences).toContain("Abrir verificação original");
    expect(incidences).toContain("Evidência da incidência de origem");
    expect(incidences).toContain("Fábrica/linha:");
    expect(incidences).toContain("Data da ocorrência:");
    expect(incidences).toContain("Validade:");
  });
});
