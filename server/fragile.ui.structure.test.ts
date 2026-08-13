import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

describe("interface de gestão de quebráveis", () => {
  it("expõe a criação de pontos por fábrica e área", () => {
    expect(source).toContain("addFragileItem.useMutation");
    expect(source).toContain("setSelectedFactoryId");
    expect(source).toContain("Adicionar ponto de controlo");
  });

  it("expõe a edição de nome, área e fábrica", () => {
    expect(source).toContain("updateFragileItem.useMutation");
    expect(source).toContain("Editar ponto de controlo");
    expect(source).toContain("openEdit(entry)");
  });

  it("expõe o carregamento de imagem de referência no editor", () => {
    expect(source).toContain("uploadFragileReferenceImage.useMutation");
    expect(source).toContain('type="file"');
    expect(source).toContain("Imagem de referência");
  });
});
