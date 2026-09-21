import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moduleControl = readFileSync(
  new URL("../client/src/pages/ModuleControl.tsx", import.meta.url),
  "utf8"
);
const incidences = readFileSync(
  new URL("../client/src/pages/Nonconformities.tsx", import.meta.url),
  "utf8"
);
const qualityRouter = readFileSync(
  new URL("./routers/quality.ts", import.meta.url),
  "utf8"
);

const sensory = moduleControl.slice(
  moduleControl.indexOf("function Sensory"),
  moduleControl.indexOf("type DispatchLot")
);

describe("colaborador responsável em incidências do controlo sensorial", () => {
  it("guarda o colaborador selecionado no produto e permite a sua edição", () => {
    expect(sensory).toContain("Colaborador responsável");
    expect(sensory).toContain("collaboratorId: collaborator?.id");
    expect(sensory).toContain("collaboratorName: collaborator?.name");
    expect(moduleControl).toContain("isBphf || isSensory ? editingEntry.collaboratorId : undefined");
    expect(qualityRouter).toContain("O colaborador associado só pode ser editado em registos BPHF ou Sensoriais.");
  });

  it("apresenta o colaborador responsável no detalhe da incidência sensorial", () => {
    expect(incidences).toContain('selected.module === "sensory"');
    expect(incidences).toContain("Contexto do controlo sensorial");
    expect(incidences).toContain("Colaborador responsável pelo produto");
  });
});
