import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MODULES } from "../client/src/lib/quality";

describe("navegação lateral dos painéis de controlo", () => {
  it("expõe atalhos para todos os módulos operacionais", async () => {
    const source = await readFile(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");

    expect(source).toContain('label: "Controlos"');
    expect(source).toContain('label: "Incidências"');
    expect(source).toContain('path: "/incidencias"');
    expect(source).toContain("Abrir módulos de controlo");
    expect(source).toContain('label: "Controlo de Processos"');
    expect(source).not.toContain('label: "Checklist de Processos"');
    expect(source).toContain("Atualizar dados da plataforma");
    expect(source).toContain("window.location.reload()");
    expect(source).not.toContain("Painéis de controlo");
    expect(source).not.toContain("I&D interno");
    expect(source).not.toContain("Controlo sensorial de I&D");
    [
      "Gestão de Ocorrências",
      "Gestão de MP",
      "Controlo Sensorial",
      "Plano Calibração",
      "Plano de Manutenção",
      "Quebras de produção",
      "Fábrica 1",
      "Fábrica 2",
      "Fábrica 3",
    ].forEach((label) => expect(source).toContain(label));
    [
      "https://analiseocorrencias.manus.space/login",
      "https://gestaompas.lovable.app",
      "https://id-interno.lovable.app/",
      "https://planocalibracao.manus.space/",
      "https://manutencaoprenventiva-as.manus.space/",
      "https://quebrasdash-tyuemnk4.manus.space/",
      "https://quebrasdash-fce2dkya.manus.space/",
    ].forEach((url) => expect(source).toContain(url));
    [
      "/controlos/bphf",
      "/controlos/metal_detectors",
      "/controlos/sensory",
      "/controlos/shelf_life",
      "/controlos/monthly_checklist",
      "/controlos/suggestion_boxes",
      "/controlos/fragile_items",
      "/controlos/dispatch_control",
    ].forEach((path) => expect(source).toContain(path));
  });

  it("identifica explicitamente a Checklist Mensal no seletor de controlos", () => {
    expect(MODULES.find((module) => module.id === "monthly_checklist")?.shortLabel).toBe("Checklist Mensal");
  });
});
