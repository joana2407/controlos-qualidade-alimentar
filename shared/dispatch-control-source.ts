export type DispatchProfileId = "ambiente" | "congelado";

export const EXTRACTED_DISPATCH_WORKBOOK = [
  { sheet: "Validação Expedição ambiente", profile: "ambiente" as const, productTemperatureLimit: 25, vehicleTemperatureLimit: 25 },
  { sheet: "Validação Expedição congelado", profile: "congelado" as const, productTemperatureLimit: -18, vehicleTemperatureLimit: -18 },
] as const;

const EXTRACTED_DISPATCH_FIELDS = [
  { id: "quantity", label: "Conf. Quantidade", sourceFields: ["N.º Cx Pedidas", "N.º Cx Expedidas"], rule: "As quantidades pedidas e expedidas devem ser iguais." },
  { id: "product_label", label: "Rotulagem Produto", sourceFields: ["Rotulagem Produto"], rule: "O produto deve apresentar rotulagem conforme." },
  { id: "box_label", label: "Rotulagem Caixa", sourceFields: ["Rotulagem Caixa"], rule: "A caixa deve apresentar rotulagem conforme." },
  { id: "product_temperature", label: "Conf. Temp. Produto", sourceFields: ["Temp. Produto (°C)"], rule: "A temperatura do produto não pode exceder o limite do perfil." },
  { id: "vehicle_temperature", label: "Conf. Temp. Veículo", sourceFields: ["Temp. Veículo (°C)"], rule: "A temperatura do veículo não pode exceder o limite do perfil." },
] as const;

/** Materializa a configuração estática a partir das duas abas analisadas do livro de expedição. */
export function loadDispatchControlCatalog(workbook = EXTRACTED_DISPATCH_WORKBOOK) {
  const expectedProfiles: DispatchProfileId[] = ["ambiente", "congelado"];
  if (workbook.length !== expectedProfiles.length || expectedProfiles.some((profile) => !workbook.some((sheet) => sheet.profile === profile))) throw new Error("A estrutura extraída do Excel não contém os dois perfis de expedição obrigatórios.");
  return {
    profiles: workbook.map((sheet) => ({ id: sheet.profile, label: sheet.sheet, productTemperatureLimit: sheet.productTemperatureLimit, vehicleTemperatureLimit: sheet.vehicleTemperatureLimit })),
    criteria: EXTRACTED_DISPATCH_FIELDS.map((field) => ({ ...field, sourceFields: [...field.sourceFields] })),
  };
}
