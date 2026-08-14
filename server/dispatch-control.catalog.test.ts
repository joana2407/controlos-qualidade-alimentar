import { describe, expect, it } from "vitest";
import { DISPATCH_CONTROL_CATALOG, getDispatchProfile } from "../shared/dispatch-control";
import { EXTRACTED_DISPATCH_WORKBOOK, loadDispatchControlCatalog } from "../shared/dispatch-control-source";

describe("catálogo importado de controlo à expedição", () => {
  it("mantém os dois perfis e os limites extraídos do registo de conformidade", () => {
    expect(DISPATCH_CONTROL_CATALOG.profiles).toEqual([
      expect.objectContaining({ id: "ambiente", label: "Validação Expedição ambiente", productTemperatureLimit: 25, vehicleTemperatureLimit: 25 }),
      expect.objectContaining({ id: "congelado", label: "Validação Expedição congelado", productTemperatureLimit: -18, vehicleTemperatureLimit: -18 }),
    ]);
  });

  it("mantém os cinco critérios automáticos usados para a conformidade global", () => {
    expect(DISPATCH_CONTROL_CATALOG.criteria.map((item) => item.id)).toEqual(["quantity", "product_label", "box_label", "product_temperature", "vehicle_temperature"]);
    expect(getDispatchProfile("congelado")).toMatchObject({ productTemperatureLimit: -18, vehicleTemperatureLimit: -18 });
  });

  it("carrega o catálogo a partir da estrutura extraída das duas abas do Excel", () => {
    const catalog = loadDispatchControlCatalog(EXTRACTED_DISPATCH_WORKBOOK);
    expect(catalog.profiles.map((profile) => profile.label)).toEqual(["Validação Expedição ambiente", "Validação Expedição congelado"]);
    expect(catalog.criteria).toHaveLength(5);
  });
});
