import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("controlo sensorial", () => {
  it("recolhe validade sem apresentar o campo Área", () => {
    const page = readFileSync(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url), "utf8");
    const sensory = page.slice(page.indexOf("function Sensory"), page.indexOf("type DispatchLot"));

    expect(sensory).toMatch(/<Label(?:\s+[^>]*)?>\s*Validade\s*<\/Label>/);
    expect(sensory).toContain('type="date"');
    expect(sensory).toContain("validity: item.validity");
    expect(sensory).toContain("const [products, setProducts] = useState<SensoryProductCheck[]>");
    expect(sensory).toContain("Adicionar produto");
    expect(sensory).toContain("Registe pelo menos um produto");
    expect(sensory).toContain("if (!products.length)");
    expect(sensory).toContain('title="Fotografia do produto"');
    expect(sensory).toContain('maxPhotos={1}');
    expect(sensory).toContain("Documente o estado visual do produto avaliado");
    expect(sensory).toContain("Colaborador responsável");
    expect(sensory).toContain("sensory-collaborator-${index}");
    expect(sensory).toContain("collaboratorId: collaborator?.id");
    expect(sensory).toContain("collaboratorName: collaborator?.name");
    expect(sensory).toContain("Fica associado à incidência");
    expect(sensory).not.toContain("<Label>Área</Label>");
  });
});
