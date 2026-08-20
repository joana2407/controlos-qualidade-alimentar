import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("navegação lateral dos painéis de controlo", () => {
  it("expõe atalhos para todos os módulos operacionais", async () => {
    const source = await readFile(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");

    expect(source).toContain('label: "Controlos"');
    expect(source).toContain('label: "Ocorrências"');
    expect(source).toContain('path: "/incidencias"');
    expect(source).toContain("Abrir módulos de controlo");
    expect(source).not.toContain("Painéis de controlo");
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
});
