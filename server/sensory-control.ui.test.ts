import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("controlo sensorial", () => {
  it("recolhe validade sem apresentar o campo Área", () => {
    const page = readFileSync(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url), "utf8");
    const sensory = page.slice(page.indexOf("function Sensory"), page.indexOf("type DispatchLot"));

    expect(sensory).toContain(">Validade</Label>");
    expect(sensory).toContain('type="date"');
    expect(sensory).toContain("payload: { product: item.product.trim(), lot: item.lot.trim(), validity: item.validity");
    expect(sensory).toContain("const [products, setProducts] = useState<SensoryProductCheck[]>([newSensoryProduct()])");
    expect(sensory).toContain("Adicionar produto");
    expect(sensory).toContain("Registe pelo menos um produto");
    expect(sensory).toContain("if (!products.length) return toast.error");
    expect(sensory).not.toContain("<Label>Área</Label>");
  });
});
