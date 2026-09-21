import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const moduleControl = readFileSync(
  `${projectRoot}/client/src/pages/ModuleControl.tsx`,
  "utf8"
);
const reports = readFileSync(
  `${projectRoot}/client/src/pages/Reports.tsx`,
  "utf8"
);
const qualityRouter = readFileSync(
  `${projectRoot}/server/routers/quality.ts`,
  "utf8"
);

describe("edição do colaborador inspecionado em BPHF", () => {
  it("apresenta o seletor no painel operacional e nos Relatórios", () => {
    expect(moduleControl).toContain('"daily-entry-bphf-collaborator"');
    expect(moduleControl).toContain("Colaborador inspecionado");
    expect(reports).toContain('id="report-entry-bphf-collaborator"');
    expect(reports).toContain('editingEntry.module === "bphf"');
  });

  it("envia o identificador do colaborador e valida-o no catálogo BPHF", () => {
    expect(moduleControl).toContain(
      "isBphf || isSensory ? editingEntry.collaboratorId : undefined"
    );
    expect(reports).toContain(
      'editingEntry.module === "bphf"'
    );
    expect(qualityRouter).toContain(
      "collaboratorId: z.number().int().positive().nullable().optional()"
    );
    expect(qualityRouter).toContain(
      "O colaborador selecionado já não existe no catálogo BPHF."
    );
    expect(qualityRouter).toContain("previousCollaboratorName");
  });
});
