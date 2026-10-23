import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import {
  DEFAULT_PROCESS_PHASES,
  PROCESS_CONTROL_CATALOG,
  PROCESS_FACTORY_LABELS,
  PROCESS_PHASE_LABELS,
  restructureProcessCatalog,
  type ProcessCatalog,
  type ProcessPhase,
  type ProcessPhaseDefinition,
} from "@/lib/processControlCatalog";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ClipboardCheck, Download, History, Pencil, Plus, Save, Search, Settings2, Trash2, TriangleAlert } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type CheckResult = "C" | "NC" | "NA";
type LotFieldKey = "mp" | "lot" | "expiry";
type LotField = { value: string; result: Exclude<CheckResult, "NA"> | "" };
type LotRow = Record<LotFieldKey, LotField>;
type PackagingFormat = { name: string; unitsPerSalesUnit: string; unitsPerBox: string };
type PackagingCatalog = Record<string, Record<string, PackagingFormat[]>>;
type ProcessCheck = {
  parameter: string;
  result: CheckResult | "";
  observedValue: string;
  notes: string;
  correctiveAction: string;
  empelosPerMass?: string;
  breakReasons?: string[];
  breakOtherReason?: string;
  packagingFormat?: string;
  unitsPerSalesUnit?: string;
  unitsPerBox?: string;
  producedUnits?: string;
  finalBoxes?: string;
  breakCount?: string;
  leftovers?: string;
  lotRows?: LotRow[];
};
type ProcessRecord = {
  id: string;
  createdAt: string;
  date: string;
  shift: string;
  responsible: string;
  responsiblePhase?: string;
  factoryId: string;
  product: string;
  recipeCode: string;
  lot: string;
  phase: string;
  phaseName?: string;
  checks: ProcessCheck[];
  overallResult: CheckResult;
};
type CatalogStorage = { version: 3; catalog: ProcessCatalog };

const STORAGE_KEY = "qualicontrol-process-checklist-v1";
const CATALOG_STORAGE_KEY = "qualicontrol-process-catalog-v1";
const PACKAGING_CATALOG_STORAGE_KEY = "qualicontrol-process-packaging-catalog-v1";
const NEW_PRODUCT_VALUE = "__novo_produto__";
const SHIFT_OPTIONS: Record<string, string[]> = {
  "1": ["15h-23h", "23h-7h", "7h-15h"],
  "2": ["15-23h", "23h-7h", "7h-15h"],
  "3": ["14h-22h", "6h-14h"],
};
const BREAK_REASON_OPTIONS = ["Metal", "Aspeto", "Sem peso", "Queimado", "Mal cozido", "Bneijado", "Partido", "Com óleo", "Outro"] as const;

const today = () => new Date().toISOString().slice(0, 10);
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT");
const phaseLabel = (phaseId: string, fallback?: string) => fallback || PROCESS_PHASE_LABELS[phaseId] || `Fase ${phaseId}`;
const pointTitle = (parameter: string) => parameter.split(" — ")[0].trim();
const pointReference = (parameter: string) => parameter.includes(" — ") ? parameter.split(" — ").slice(1).join(" — ").trim() : "";
const isLotVerification = (parameter: string) => /pesagem\s+de\s+mp|verifica[cç][aã]o\s+dos?\s+lotes?/i.test(pointTitle(parameter));
const isEmpelosVerification = (parameter: string) => /tender\s*\/\s*dividir|tender\s+a\s+massa|dividir\s+a\s+massa/i.test(pointTitle(parameter));
const isBreakVerification = (parameter: string) => /n[ºo]\.?\s*(de\s+)?quebras/i.test(pointTitle(parameter));
const isPackagingVerification = (parameter: string) => /condi[cç][oõ]es\s+de\s+embalamento|^embalamento$/i.test(pointTitle(parameter));
const selectedBreakReasons = (check: ProcessCheck) => Array.isArray(check.breakReasons) ? check.breakReasons : check.breakReasons ? [check.breakReasons] : [];
const emptyLotRow = (): LotRow => ({ mp: { value: "", result: "" }, lot: { value: "", result: "" }, expiry: { value: "", result: "" } });
const cloneCatalog = (catalog: ProcessCatalog): ProcessCatalog => JSON.parse(JSON.stringify(catalog)) as ProcessCatalog;
const DEFAULT_PHASE_PARAMETERS: Record<string, string[]> = {
  "1": ["PESAGEM DE MP"],
  "2": ["Amassadura", "Repouso", "Tender/dividir a massa", "Nº unidades por massa", "Levedação", "Acabamento"],
  "3": ["Tratamento térmico"],
  "4": ["Condições de embalamento", "Rotulagem", "Nº Quebras", "Nº Sobras", "Nº Amostras", "Nº Cx/massa"],
};
const defaultPhases = (): ProcessPhaseDefinition[] => DEFAULT_PROCESS_PHASES.map(phase => ({ ...phase, parameters: [...(DEFAULT_PHASE_PARAMETERS[phase.id] ?? [])] }));
const createPhaseId = () => `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readPackagingCatalog = (): PackagingCatalog => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PACKAGING_CATALOG_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as PackagingCatalog : {};
  } catch {
    return {};
  }
};

const parsePackagingFormats = (value: string): PackagingFormat[] => value
  .split("\n")
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const [name = "", unitsPerSalesUnit = "", unitsPerBox = ""] = line.split("|").map(item => item.trim());
    return { name, unitsPerSalesUnit, unitsPerBox };
  })
  .filter(format => format.name && Number(format.unitsPerSalesUnit) > 0 && Number(format.unitsPerBox) > 0);

const packagingFormatsToDraft = (formats?: PackagingFormat[]) => (formats ?? [])
  .map(format => `${format.name} | ${format.unitsPerSalesUnit} | ${format.unitsPerBox}`)
  .join("\n");

function isCatalogShape(value: unknown): value is ProcessCatalog {
  if (!value || typeof value !== "object") return false;
  return ["1", "2", "3"].every(factoryId => {
    const factory = (value as Record<string, unknown>)[factoryId] as { sheet?: unknown; products?: unknown } | undefined;
    return Boolean(factory && typeof factory.sheet === "string" && factory.products && typeof factory.products === "object");
  });
}

function readCatalog(): ProcessCatalog {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY) ?? "null") as { catalog?: unknown } | null;
    return restructureProcessCatalog(isCatalogShape(parsed?.catalog) ? parsed!.catalog : PROCESS_CONTROL_CATALOG);
  } catch {
    return cloneCatalog(PROCESS_CONTROL_CATALOG);
  }
}

function readRecords(): ProcessRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resultLabel(result: CheckResult | "") {
  return result === "C" ? "Conforme" : result === "NC" ? "Não conforme" : result === "NA" ? "Não aplicável" : "Por validar";
}

function emptyCheck(parameter: string): ProcessCheck {
  return {
    parameter,
    result: "",
    observedValue: "",
    notes: "",
    correctiveAction: "",
    ...(isEmpelosVerification(parameter) ? { empelosPerMass: "" } : {}),
    ...(isBreakVerification(parameter) ? { breakReasons: [], breakOtherReason: "" } : {}),
    ...(isPackagingVerification(parameter) ? {
      packagingFormat: "",
      unitsPerSalesUnit: "",
      unitsPerBox: "",
      producedUnits: "",
      finalBoxes: "",
      breakCount: "",
      leftovers: "",
    } : {}),
    ...(isLotVerification(parameter) ? { lotRows: [emptyLotRow()] } : {}),
  };
}

export default function ProcessChecklist() {
  const { canManage } = useQualityAccess();
  const employees = trpc.quality.listBphfInspectionEmployees.useQuery();
  const [catalog, setCatalog] = useState<ProcessCatalog>(readCatalog);
  const [factoryId, setFactoryId] = useState("1");
  const [product, setProduct] = useState("");
  const [phase, setPhase] = useState("");
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState(SHIFT_OPTIONS["1"][0]);
  const [responsible, setResponsible] = useState("");
  const [responsiblePhase, setResponsiblePhase] = useState("");
  const [recipeCode, setRecipeCode] = useState("");
  const [lot, setLot] = useState("");
  const [checks, setChecks] = useState<ProcessCheck[]>([]);
  const [records, setRecords] = useState<ProcessRecord[]>(readRecords);
  const [historySearch, setHistorySearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFactoryId, setCatalogFactoryId] = useState("1");
  const [catalogProductKey, setCatalogProductKey] = useState(NEW_PRODUCT_VALUE);
  const [catalogProductName, setCatalogProductName] = useState("");
  const [editorPhases, setEditorPhases] = useState<ProcessPhaseDefinition[]>(defaultPhases);
  const [packagingCatalog, setPackagingCatalog] = useState<PackagingCatalog>(readPackagingCatalog);
  const [packagingFormatsDraft, setPackagingFormatsDraft] = useState("");

  useEffect(() => {
    const storage: CatalogStorage = { version: 3, catalog };
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(storage));
  }, [catalog]);

  const products = useMemo(() => Object.keys(catalog[factoryId]?.products ?? {}), [catalog, factoryId]);
  const selectedProduct = catalog[factoryId]?.products[product];
  const selectedPhase = selectedProduct?.phases.find(item => item.id === phase);
  const catalogProducts = useMemo(() => Object.keys(catalog[catalogFactoryId]?.products ?? {}), [catalog, catalogFactoryId]);
  const filteredRecords = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("pt-PT");
    return records.filter(record => !query || [
      record.product,
      record.recipeCode,
      record.responsible,
      record.responsiblePhase,
      record.lot,
      PROCESS_FACTORY_LABELS[record.factoryId],
      phaseLabel(record.phase, record.phaseName),
    ].join(" ").toLocaleLowerCase("pt-PT").includes(query)).slice(0, 30);
  }, [historySearch, records]);

  const createChecks = (nextFactoryId: string, nextProduct: string, nextPhase: string, formats = packagingCatalog) => {
    const productDefinition = catalog[nextFactoryId]?.products[nextProduct];
    const phaseDefinition = productDefinition?.phases.find(item => item.id === nextPhase);
    return (phaseDefinition?.parameters ?? []).map(parameter => {
      const check = emptyCheck(parameter);
      const defaultFormat = isPackagingVerification(parameter) ? formats[nextFactoryId]?.[nextProduct]?.[0] : undefined;
      return defaultFormat ? {
        ...check,
        packagingFormat: defaultFormat.name,
        unitsPerSalesUnit: defaultFormat.unitsPerSalesUnit,
        unitsPerBox: defaultFormat.unitsPerBox,
      } : check;
    });
  };

  const chooseFactory = (value: string) => {
    setFactoryId(value);
    setProduct("");
    setPhase("");
    setChecks([]);
    setShift(SHIFT_OPTIONS[value]?.[0] ?? "");
  };

  const chooseProduct = (value: string) => {
    const firstPhase = catalog[factoryId]?.products[value]?.phases[0]?.id ?? "";
    setProduct(value);
    setPhase(firstPhase);
    setChecks(createChecks(factoryId, value, firstPhase));
  };

  const choosePhase = (value: string) => {
    setPhase(value);
    setChecks(createChecks(factoryId, product, value));
  };

  const updateCheck = (index: number, patch: Partial<ProcessCheck>) => setChecks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateLotField = (index: number, rowIndex: number, field: LotFieldKey, patch: Partial<LotField>) => setChecks(current => current.map((item, itemIndex) => {
    if (itemIndex !== index || !item.lotRows?.[rowIndex]) return item;
    const lotRows = item.lotRows.map((row, currentRowIndex) => currentRowIndex === rowIndex ? { ...row, [field]: { ...row[field], ...patch } } : row);
    const fieldResults = lotRows.flatMap(row => Object.values(row).map(value => value.result));
    const result: CheckResult | "" = fieldResults.some(value => value === "NC") ? "NC" : fieldResults.every(value => value === "C") ? "C" : "";
    return { ...item, lotRows, result };
  }));
  const addLotRow = (index: number) => setChecks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, lotRows: [...(item.lotRows ?? []), emptyLotRow()], result: "" } : item));
  const removeLotRow = (index: number, rowIndex: number) => setChecks(current => current.map((item, itemIndex) => {
    if (itemIndex !== index || !item.lotRows || item.lotRows.length <= 1) return item;
    const lotRows = item.lotRows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex);
    const fieldResults = lotRows.flatMap(row => Object.values(row).map(value => value.result));
    const result: CheckResult | "" = fieldResults.some(value => value === "NC") ? "NC" : fieldResults.every(value => value === "C") ? "C" : "";
    return { ...item, lotRows, result };
  }));

  const setEditorForProduct = (nextFactoryId: string, nextProduct: string) => {
    setCatalogProductKey(nextProduct);
    const selected = nextProduct === NEW_PRODUCT_VALUE ? undefined : catalog[nextFactoryId]?.products[nextProduct];
    setCatalogProductName(nextProduct === NEW_PRODUCT_VALUE ? "" : nextProduct);
    setEditorPhases(selected ? selected.phases.map(item => ({ ...item, parameters: [...item.parameters] })) : defaultPhases());
    setPackagingFormatsDraft(nextProduct === NEW_PRODUCT_VALUE ? "" : packagingFormatsToDraft(packagingCatalog[nextFactoryId]?.[nextProduct]));
  };

  const openCatalogManager = () => {
    const initialProduct = product && catalog[factoryId]?.products[product] ? product : Object.keys(catalog[factoryId]?.products ?? {})[0] ?? NEW_PRODUCT_VALUE;
    setCatalogFactoryId(factoryId);
    setEditorForProduct(factoryId, initialProduct);
    setCatalogOpen(true);
  };

  const updateEditorPhase = (phaseId: string, patch: Partial<ProcessPhaseDefinition>) => setEditorPhases(current => current.map(item => item.id === phaseId ? { ...item, ...patch } : item));
  const addEditorPhase = () => setEditorPhases(current => [...current, { id: createPhaseId(), name: "", parameters: [] }]);
  const removeEditorPhase = (phaseId: string) => {
    const current = editorPhases.find(item => item.id === phaseId);
    if (!current || !window.confirm(`Eliminar a fase «${current.name || "sem nome"}»? Os registos históricos não serão alterados.`)) return;
    setEditorPhases(items => items.filter(item => item.id !== phaseId));
  };
  const addEditorParameter = (phaseId: string) => updateEditorPhase(phaseId, { parameters: [...(editorPhases.find(item => item.id === phaseId)?.parameters ?? []), ""] });
  const updateEditorParameter = (phaseId: string, index: number, value: string) => {
    const item = editorPhases.find(candidate => candidate.id === phaseId);
    if (!item) return;
    const parameters = item.parameters.map((parameter, parameterIndex) => parameterIndex === index ? value : parameter);
    updateEditorPhase(phaseId, { parameters });
  };
  const removeEditorParameter = (phaseId: string, index: number) => {
    const item = editorPhases.find(candidate => candidate.id === phaseId);
    if (!item || !window.confirm("Eliminar este ponto de controlo? Os registos históricos não serão alterados.")) return;
    updateEditorPhase(phaseId, { parameters: item.parameters.filter((_, parameterIndex) => parameterIndex !== index) });
  };

  const deleteProductConfiguration = () => {
    if (!canManage || catalogProductKey === NEW_PRODUCT_VALUE) return;
    if (!window.confirm(`Eliminar o produto «${catalogProductKey}» deste catálogo? Os registos históricos não serão alterados.`)) return;
    const nextCatalog = cloneCatalog(catalog);
    const nextPackagingCatalog = JSON.parse(JSON.stringify(packagingCatalog)) as PackagingCatalog;
    delete nextCatalog[catalogFactoryId].products[catalogProductKey];
    delete nextPackagingCatalog[catalogFactoryId]?.[catalogProductKey];
    const nextProduct = Object.keys(nextCatalog[catalogFactoryId].products)[0] ?? NEW_PRODUCT_VALUE;
    setCatalog(nextCatalog);
    setPackagingCatalog(nextPackagingCatalog);
    localStorage.setItem(PACKAGING_CATALOG_STORAGE_KEY, JSON.stringify(nextPackagingCatalog));
    if (factoryId === catalogFactoryId && product === catalogProductKey) {
      setProduct("");
      setPhase("");
      setChecks([]);
    }
    setEditorForProduct(catalogFactoryId, nextProduct);
    toast.success("Produto removido do catálogo. Os registos históricos foram preservados.");
  };

  const saveProductConfiguration = () => {
    if (!canManage) return toast.error("Apenas a Responsável de Qualidade pode alterar o catálogo de processos.");
    const normalizedName = catalogProductName.trim().replace(/\s+/g, " ");
    const normalizedPhases = editorPhases.map(item => ({
      id: item.id,
      name: item.name.trim().replace(/\s+/g, " "),
      parameters: item.parameters.map(parameter => parameter.trim().replace(/\s+/g, " ")).filter(Boolean),
    }));
    const phaseNames = normalizedPhases.map(item => normalized(item.name));
    const packagingLines = packagingFormatsDraft.split("\n").map(line => line.trim()).filter(Boolean);
    const nextPackagingFormats = parsePackagingFormats(packagingFormatsDraft);
    if (!normalizedName) return toast.error("Indique o nome do produto.");
    if (!normalizedPhases.length) return toast.error("Defina pelo menos uma fase de controlo.");
    if (normalizedPhases.some(item => !item.name)) return toast.error("Dê um nome a todas as fases antes de guardar.");
    if (new Set(phaseNames).size !== phaseNames.length) return toast.error("Não pode existir mais do que uma fase com o mesmo nome.");
    if (normalizedPhases.some(item => !item.parameters.length)) return toast.error("Defina pelo menos um ponto de controlo em cada fase.");
    if (packagingLines.length !== nextPackagingFormats.length) return toast.error("Cada formato de embalagem deve seguir: Nome | unidades por unidade de venda | unidades por caixa.");

    const nextCatalog = cloneCatalog(catalog);
    const nextPackagingCatalog = JSON.parse(JSON.stringify(packagingCatalog)) as PackagingCatalog;
    const targetProducts = nextCatalog[catalogFactoryId].products;
    if (catalogProductKey !== NEW_PRODUCT_VALUE && catalogProductKey !== normalizedName) delete targetProducts[catalogProductKey];
    if (catalogProductKey === NEW_PRODUCT_VALUE && targetProducts[normalizedName]) return toast.error("Já existe um produto com este nome nesta fábrica. Selecione-o para editar.");
    if (catalogProductKey !== NEW_PRODUCT_VALUE && catalogProductKey !== normalizedName && targetProducts[normalizedName]) return toast.error("Já existe outro produto com este nome nesta fábrica.");
    targetProducts[normalizedName] = { phases: normalizedPhases };

    const factoryPackaging = nextPackagingCatalog[catalogFactoryId] ?? {};
    if (catalogProductKey !== NEW_PRODUCT_VALUE && catalogProductKey !== normalizedName) delete factoryPackaging[catalogProductKey];
    factoryPackaging[normalizedName] = nextPackagingFormats;
    nextPackagingCatalog[catalogFactoryId] = factoryPackaging;
    localStorage.setItem(PACKAGING_CATALOG_STORAGE_KEY, JSON.stringify(nextPackagingCatalog));
    setCatalog(nextCatalog);
    setPackagingCatalog(nextPackagingCatalog);
    setCatalogProductKey(normalizedName);
    setCatalogProductName(normalizedName);
    setEditorPhases(normalizedPhases);
    setPackagingFormatsDraft(packagingFormatsToDraft(nextPackagingFormats));

    if (factoryId === catalogFactoryId && (product === catalogProductKey || catalogProductKey === NEW_PRODUCT_VALUE)) {
      const nextPhase = normalizedPhases[0]?.id ?? "";
      setProduct(normalizedName);
      setPhase(nextPhase);
      setChecks(createChecks(catalogFactoryId, normalizedName, nextPhase, nextPackagingCatalog));
    }
    toast.success(catalogProductKey === NEW_PRODUCT_VALUE ? "Novo produto criado com as fases configuradas." : "Configuração do produto atualizada.");
  };

  const save = () => {
    if (!date || !shift || !responsible.trim() || !product || !selectedPhase || !checks.length) return toast.error("Preencha a data, turno, responsável, produto e fase antes de guardar.");
    if (checks.some(check => isLotVerification(check.parameter) && (!check.lotRows?.length || check.lotRows.some(row => Object.values(row).some(field => !field.value.trim() || !field.result))))) return toast.error("No ponto de Pesagem de MP, preencha todas as MP, os respetivos lotes e validades e valide cada campo como C ou NC.");
    if (checks.some(check => isEmpelosVerification(check.parameter) && (!check.empelosPerMass?.trim() || Number(check.empelosPerMass) <= 0))) return toast.error("Indique o N.º de empelos por massa antes de guardar a checklist.");
    if (checks.some(check => isBreakVerification(check.parameter) && selectedBreakReasons(check).includes("Outro") && !check.breakOtherReason?.trim())) return toast.error("Especifique o motivo quando selecionar Outro em Nº Quebras.");
    if (checks.some(check => isPackagingVerification(check.parameter) && ([check.unitsPerSalesUnit, check.unitsPerBox, check.producedUnits, check.finalBoxes].some(value => !value?.trim() || Number(value) <= 0) || !check.breakCount?.trim() || Number(check.breakCount) < 0 || !check.leftovers?.trim() || Number(check.leftovers) < 0))) return toast.error("Em Condições de embalamento, preencha os seis valores obrigatórios: unidades por unidade de venda, unidades por caixa, unidades produzidas, N.º Cx Final, N.º de quebras e N.º de sobras.");
    if (checks.some(check => isPackagingVerification(check.parameter) && Number(check.finalBoxes) * Number(check.unitsPerBox) + Number(check.breakCount) + Number(check.leftovers) !== Number(check.producedUnits))) return toast.error("A produção total tem de ser exatamente igual às unidades embaladas, quebras e sobras.");
    if (checks.some(check => !check.result)) return toast.error("Valide todos os pontos da fase como Conforme, Não conforme ou Não aplicável.");
    if (checks.some(check => check.result === "NC" && !check.correctiveAction.trim())) return toast.error("Para cada ponto Não conforme, indique a ação corretiva ou de contenção.");

    const overallResult: CheckResult = checks.some(check => check.result === "NC") ? "NC" : checks.every(check => check.result === "NA") ? "NA" : "C";
    const entry: ProcessRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      date,
      shift,
      responsible: responsible.trim(),
      responsiblePhase: responsiblePhase.trim(),
      factoryId,
      product,
      recipeCode: recipeCode.trim(),
      lot: lot.trim(),
      phase,
      phaseName: selectedPhase.name,
      checks,
      overallResult,
    };
    const next = [entry, ...records];
    setRecords(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast[overallResult === "NC" ? "error" : "success"](overallResult === "NC" ? "Checklist guardada com desvio. Registe/acompanhe a ação corretiva." : "Checklist de processo guardada com sucesso.");
    setChecks(createChecks(factoryId, product, phase));
  };

  const removeRecord = (id: string) => {
    const next = records.filter(record => record.id !== id);
    setRecords(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast.success("Registo removido do histórico local.");
  };

  const exportRecords = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `controlo-processos-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderCheck = (check: ProcessCheck, index: number) => {
    const lotRows = check.lotRows;
    const producedUnits = Number(check.producedUnits);
    const finalBoxes = Number(check.finalBoxes);
    const unitsPerBox = Number(check.unitsPerBox);
    const packedUnits = finalBoxes * unitsPerBox;
    const breakCount = Number(check.breakCount);
    const leftovers = Number(check.leftovers);
    const reconciliationInputsReady = [check.producedUnits, check.finalBoxes, check.unitsPerBox, check.breakCount, check.leftovers].every(value => Boolean(value?.trim()) && Number.isFinite(Number(value)));
    const reconciliationDifference = reconciliationInputsReady ? producedUnits - (packedUnits + breakCount + leftovers) : 0;
    const packagingReady = isPackagingVerification(check.parameter) && producedUnits > 0 && finalBoxes > 0 && unitsPerBox > 0 && breakCount >= 0 && leftovers >= 0 && packedUnits + breakCount + leftovers === producedUnits;
    const breakPercentage = packagingReady ? (breakCount / producedUnits) * 100 : 0;
    const yieldPercentage = packagingReady ? (packedUnits / producedUnits) * 100 : 0;
    const title = pointTitle(check.parameter);
    const reference = pointReference(check.parameter);

    if (lotRows) {
      const lotFieldDefinitions: Array<{ key: LotFieldKey; label: string; placeholder: string; type?: string }> = [
        { key: "mp", label: "MP", placeholder: "Matéria-prima" },
        { key: "lot", label: "Lote", placeholder: "Referência do lote" },
        { key: "expiry", label: "Validade", placeholder: "Data de validade", type: "date" },
      ];
      return <div key={`${check.parameter}-${index}`} className={`rounded-xl border p-4 ${check.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ponto {index + 1}</p><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Validação individual obrigatória:</span> cada MP deve ter o seu lote e validade confirmados.</p></div><Button type="button" size="sm" variant="outline" onClick={() => addLotRow(index)}><Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar MP</Button></div>
        <div className="space-y-3">{lotRows.map((row, rowIndex) => <div key={rowIndex} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Matéria-prima {rowIndex + 1}</p>{lotRows.length > 1 ? <Button type="button" size="sm" variant="ghost" className="h-7 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeLotRow(index, rowIndex)}>Remover</Button> : null}</div><div className="grid gap-3 lg:grid-cols-3">{lotFieldDefinitions.map(field => <div key={field.key}><Label htmlFor={`lot-${field.key}-${index}-${rowIndex}`}>{field.label}</Label><Input id={`lot-${field.key}-${index}-${rowIndex}`} type={field.type ?? "text"} placeholder={field.placeholder} value={row[field.key].value} onChange={event => updateLotField(index, rowIndex, field.key, { value: event.target.value })} className="mt-2 bg-white" /><p className="mt-3 text-xs font-medium text-slate-600">Validação de {field.label}</p><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" size="sm" variant={row[field.key].result === "C" ? "default" : "outline"} onClick={() => updateLotField(index, rowIndex, field.key, { result: "C" })}>C</Button><Button type="button" size="sm" variant={row[field.key].result === "NC" ? "destructive" : "outline"} onClick={() => updateLotField(index, rowIndex, field.key, { result: "NC" })}>NC</Button></div><p className="mt-1 text-[11px] text-slate-500">{resultLabel(row[field.key].result)}</p></div>)}</div></div>)}</div>
        <div className="mt-3 space-y-2"><Label htmlFor={`notes-${index}`}>Observações</Label><Textarea id={`notes-${index}`} rows={2} placeholder="Evidência, desvio ou observação" value={check.notes} onChange={event => updateCheck(index, { notes: event.target.value })} /></div>
        {check.result === "NC" ? <div className="mt-3 space-y-2"><Label htmlFor={`action-${index}`}>Ação corretiva / contenção</Label><Textarea id={`action-${index}`} rows={2} placeholder="Ação imediata, responsável e prazo" value={check.correctiveAction} onChange={event => updateCheck(index, { correctiveAction: event.target.value })} /></div> : null}
      </div>;
    }

    return <div key={`${check.parameter}-${index}`} className={`rounded-xl border p-4 ${check.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_minmax(0,1fr)] lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ponto {index + 1}</p><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Referência:</span> {reference || "consultar o parâmetro aprovado no catálogo do produto."}</p></div><div className="space-y-2"><Label htmlFor={`observed-${index}`}>Valor observado</Label><Input id={`observed-${index}`} placeholder="Valor / confirmação" value={check.observedValue} onChange={event => updateCheck(index, { observedValue: event.target.value })} /></div><div className="space-y-2"><Label>Validação</Label><div className="grid grid-cols-3 gap-1">{(["C", "NC", "NA"] as CheckResult[]).map(result => <Button key={result} type="button" size="sm" variant={check.result === result ? result === "NC" ? "destructive" : "default" : "outline"} onClick={() => updateCheck(index, { result })}>{result}</Button>)}</div><p className="text-[11px] text-slate-500">{resultLabel(check.result)}</p></div><div className="space-y-2"><Label htmlFor={`notes-${index}`}>Observações</Label><Textarea id={`notes-${index}`} rows={2} placeholder="Evidência, desvio ou observação" value={check.notes} onChange={event => updateCheck(index, { notes: event.target.value })} /></div></div>
      {(isEmpelosVerification(check.parameter) || isBreakVerification(check.parameter)) ? <div className="mt-4 grid gap-4 md:grid-cols-2">{isEmpelosVerification(check.parameter) ? <div className="space-y-2"><Label htmlFor={`empelos-${index}`}>N.º de empelos por massa</Label><Input id={`empelos-${index}`} inputMode="numeric" placeholder="Quantidade de empelos" value={check.empelosPerMass ?? ""} onChange={event => updateCheck(index, { empelosPerMass: event.target.value })} /><p className="text-xs text-slate-500">Registe a quantidade efetivamente obtida por cada massa.</p></div> : null}{isBreakVerification(check.parameter) ? <div className="space-y-3"><p className="text-sm font-medium text-slate-900">Motivos de quebra</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{BREAK_REASON_OPTIONS.map(reason => { const selected = selectedBreakReasons(check).includes(reason); return <label key={reason} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${selected ? "border-orange-300 bg-orange-50 text-orange-950" : "border-slate-200 bg-white text-slate-700"}`}><input id={`break-reason-${index}-${reason}`} type="checkbox" checked={selected} onChange={() => { const current = selectedBreakReasons(check); updateCheck(index, { breakReasons: selected ? current.filter(item => item !== reason) : [...current, reason] }); }} className="h-4 w-4 accent-orange-600" />{reason}</label>; })}</div>{selectedBreakReasons(check).includes("Outro") ? <div className="space-y-2"><Label htmlFor={`break-other-${index}`}>Outro motivo — qual?</Label><Input id={`break-other-${index}`} placeholder="Especifique o motivo" value={check.breakOtherReason ?? ""} onChange={event => updateCheck(index, { breakOtherReason: event.target.value })} /></div> : null}<p className="text-xs text-slate-500">Selecione todos os motivos aplicáveis. Se escolher Outro, especifique qual.</p></div> : null}</div> : null}
      {isPackagingVerification(check.parameter) ? <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4"><p className="text-sm font-semibold text-teal-950">Embalamento e rendimento</p><p className="mt-1 text-xs leading-5 text-teal-800">Defina o formato primário e registe a produção real para calcular automaticamente a quebra e a rentabilidade.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-7"><div className="space-y-2 lg:col-span-2"><Label htmlFor={`packaging-format-${index}`}>Forma de embalamento primário</Label><Input id={`packaging-format-${index}`} placeholder="Ex.: saco com 5 unidades" value={check.packagingFormat ?? ""} onChange={event => updateCheck(index, { packagingFormat: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`units-sales-${index}`}>N.º unidades / unidade de venda</Label><Input id={`units-sales-${index}`} type="number" min="1" step="1" placeholder="Ex.: 5" value={check.unitsPerSalesUnit ?? ""} onChange={event => updateCheck(index, { unitsPerSalesUnit: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`units-box-${index}`}>N.º unidades / caixa</Label><Input id={`units-box-${index}`} type="number" min="1" step="1" placeholder="Ex.: 20" value={check.unitsPerBox ?? ""} onChange={event => updateCheck(index, { unitsPerBox: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`produced-${index}`}>N.º unidades produzidas</Label><Input id={`produced-${index}`} type="number" min="1" step="1" placeholder="Produção total" value={check.producedUnits ?? ""} onChange={event => updateCheck(index, { producedUnits: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`final-boxes-${index}`}>N.º Cx Final</Label><Input id={`final-boxes-${index}`} type="number" min="1" step="1" placeholder="Total de caixas embaladas" value={check.finalBoxes ?? ""} onChange={event => updateCheck(index, { finalBoxes: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`break-count-${index}`}>N.º de quebras</Label><Input id={`break-count-${index}`} type="number" min="0" step="1" placeholder="Unidades em quebra" value={check.breakCount ?? ""} onChange={event => updateCheck(index, { breakCount: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`leftovers-${index}`}>N.º de sobras</Label><Input id={`leftovers-${index}`} type="number" min="0" step="1" placeholder="Unidades sobrantes" value={check.leftovers ?? ""} onChange={event => updateCheck(index, { leftovers: event.target.value })} /></div></div>{reconciliationInputsReady ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Unidades de venda</p><p className="mt-1 text-lg font-semibold text-slate-950">{Math.floor(packedUnits / Number(check.unitsPerSalesUnit))}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Unidades embaladas</p><p className="mt-1 text-lg font-semibold text-slate-950">{packedUnits}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Sobras</p><p className="mt-1 text-lg font-semibold text-slate-950">{leftovers}</p></div><div className={`rounded-lg p-3 ${reconciliationDifference === 0 ? "bg-emerald-50" : "bg-amber-50"}`}><p className="text-xs text-slate-500">Diferença por reconciliar</p><p className={`mt-1 text-lg font-semibold ${reconciliationDifference === 0 ? "text-emerald-700" : "text-amber-700"}`}>{reconciliationDifference === 0 ? "0" : `${Math.abs(reconciliationDifference)} ${reconciliationDifference > 0 ? "em falta" : "em excesso"}`}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">% quebra</p><p className="mt-1 text-lg font-semibold text-red-700">{breakPercentage.toFixed(2)}%</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">% rentabilidade</p><p className="mt-1 text-lg font-semibold text-emerald-700">{yieldPercentage.toFixed(2)}%</p></div></div> : null}</div> : null}
      {check.result === "NC" ? <div className="mt-3 space-y-2"><Label htmlFor={`action-${index}`}>Ação corretiva / contenção</Label><Textarea id={`action-${index}`} rows={2} placeholder="Ação imediata, responsável e prazo" value={check.correctiveAction} onChange={event => updateCheck(index, { correctiveAction: event.target.value })} /></div> : null}
    </div>;
  };

  return <div className="app-grid min-h-full -m-4 space-y-6 bg-slate-50/60 p-4 md:-m-6 md:p-6">
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Novo controlo operacional</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><ClipboardCheck className="h-7 w-7 text-teal-700" />Controlo de Processos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Acompanhe no terreno a implementação dos parâmetros por produto, fase e turno. Os pontos seguem uma grelha comum e mantêm as referências específicas de cada produto.</p></div><div className="flex flex-wrap gap-2">{canManage ? <Button variant="outline" onClick={openCatalogManager}><Settings2 className="mr-2 h-4 w-4" />Gerir produtos e parâmetros</Button> : null}<Button variant="outline" onClick={exportRecords} disabled={!records.length}><Download className="mr-2 h-4 w-4" />Exportar histórico</Button></div></div>
      {canManage ? <Card className="border-teal-100 bg-teal-50/45"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-teal-950">Catálogo configurável pela Responsável de Qualidade</p><p className="mt-1 text-xs leading-5 text-teal-800">Pode criar, alterar ou eliminar produtos, fases e pontos de controlo. As alterações aplicam-se às novas fichas e não alteram o histórico já guardado.</p></div><Button size="sm" variant="outline" className="border-teal-200 bg-white text-teal-900 hover:bg-teal-100" onClick={openCatalogManager}><Pencil className="mr-1.5 h-3.5 w-3.5" />Abrir catálogo</Button></CardContent></Card> : null}
      <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex gap-3 p-4 text-sm text-amber-950"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold">Grelha transversal de controlo</p><p className="mt-1 leading-6">Todos os produtos têm por defeito as fases Pesagem e amassadura, Produção, Cozedura e Embalamento. A Responsável de Qualidade pode acrescentar, renomear ou remover fases e definir os pontos e parâmetros aplicáveis a cada produto.</p></div></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Identificação da verificação</CardTitle><CardDescription>Preencha uma ficha por produto, fase e turno. Pode guardar várias fichas no mesmo dia.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label htmlFor="factory-select">Fábrica</Label><Select value={factoryId} onValueChange={chooseFactory}><SelectTrigger id="factory-select"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_FACTORY_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="production-date">Data de produção</Label><Input id="production-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="shift">Horário do turno</Label><Select value={shift || "none"} onValueChange={value => setShift(value === "none" ? "" : value)}><SelectTrigger id="shift"><SelectValue placeholder="Selecione o turno" /></SelectTrigger><SelectContent>{(SHIFT_OPTIONS[factoryId] ?? []).map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Horários predefinidos para a fábrica selecionada.</p></div><div className="space-y-2"><Label htmlFor="shift-responsible">Responsável do turno</Label><Input id="shift-responsible" placeholder="Nome do responsável" value={responsible} onChange={event => setResponsible(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="recipe-code">Código da receita</Label><Input id="recipe-code" placeholder="Ex.: REC-001" value={recipeCode} onChange={event => setRecipeCode(event.target.value)} /></div><div className="space-y-2 lg:col-span-2"><Label htmlFor="product-select">Produto</Label><Select value={product} onValueChange={chooseProduct}><SelectTrigger id="product-select"><SelectValue placeholder="Selecione o produto" /></SelectTrigger><SelectContent>{products.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="phase-select">Fase</Label><Select value={phase || "none"} onValueChange={value => choosePhase(value === "none" ? "" : value)} disabled={!product}><SelectTrigger id="phase-select"><SelectValue placeholder="Selecione a fase" /></SelectTrigger><SelectContent>{selectedProduct?.phases.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="responsible-phase">Responsável pela fase</Label><Select value={responsiblePhase || "none"} onValueChange={value => setResponsiblePhase(value === "none" ? "" : value)}><SelectTrigger id="responsible-phase"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent><SelectItem value="none">Não atribuído</SelectItem>{(employees.data ?? []).map(employee => <SelectItem key={employee.id} value={employee.name}>{employee.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">O nome fica preservado no histórico da fase.</p></div><div className="space-y-2"><Label htmlFor="lot-reference">Lote / referência</Label><Input id="lot-reference" placeholder="Lote a confirmar com Produção" value={lot} onChange={event => setLot(event.target.value)} /></div></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><CardTitle>{product && selectedPhase ? `${selectedPhase.name} · ${product}` : "Parâmetros da fase"}</CardTitle><CardDescription>{product && selectedPhase ? "Consulte a referência aprovada e registe o valor observado, decisão e ação corretiva." : "Selecione fábrica, produto e fase para carregar os parâmetros."}</CardDescription></div>{checks.length ? <Badge variant="outline">{checks.length} ponto(s)</Badge> : null}</div></CardHeader><CardContent className="space-y-3">{!checks.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Ainda não existem pontos carregados para preencher.</div> : checks.map(renderCheck)}{checks.length ? <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Uma decisão NC fica guardada no histórico local com o desvio e a ação corretiva introduzida.</p><Button size="lg" onClick={save}><CheckCircle2 className="mr-2 h-4 w-4" />Guardar checklist</Button></div> : null}</CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-teal-700" />Histórico local de checklists</CardTitle><CardDescription>Registos preservados neste dispositivo. Inclua-os no Backup JSON da aplicação.</CardDescription></div><div className="relative w-full md:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Pesquisar produto, receita, lote ou responsável" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /></div></div></CardHeader><CardContent>{filteredRecords.length ? <div className="space-y-2">{filteredRecords.map(record => <div key={record.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{record.product}</p><Badge className={record.overallResult === "NC" ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{resultLabel(record.overallResult)}</Badge></div><p className="mt-1 text-xs text-slate-600">{PROCESS_FACTORY_LABELS[record.factoryId]} · {phaseLabel(record.phase, record.phaseName)} · {record.date} · {record.shift}</p><p className="mt-1 text-xs text-slate-500">Responsável do turno: {record.responsible}{record.responsiblePhase ? ` · Responsável da fase: ${record.responsiblePhase}` : ""}{record.recipeCode ? ` · Receita: ${record.recipeCode}` : ""}{record.lot ? ` · Lote: ${record.lot}` : ""} · {record.checks.length} ponto(s)</p></div><Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeRecord(record.id)}><Trash2 className="mr-1.5 h-4 w-4" />Eliminar</Button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Ainda não existem registos guardados neste dispositivo.</div>}</CardContent></Card>
    </section>

    <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Catálogo de produtos, fases e pontos de controlo</DialogTitle><DialogDescription>Disponível exclusivamente para a Responsável de Qualidade. As alterações aplicam-se às novas fichas; os registos anteriores preservam o histórico original.</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="catalog-factory">Fábrica</Label><Select value={catalogFactoryId} onValueChange={value => { setCatalogFactoryId(value); setEditorForProduct(value, Object.keys(catalog[value]?.products ?? {})[0] ?? NEW_PRODUCT_VALUE); }}><SelectTrigger id="catalog-factory"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_FACTORY_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="catalog-product">Produto a configurar</Label><div className="flex gap-2"><Select value={catalogProductKey} onValueChange={value => setEditorForProduct(catalogFactoryId, value)}><SelectTrigger id="catalog-product"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NEW_PRODUCT_VALUE}>Novo produto…</SelectItem>{catalogProducts.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" size="icon" title="Criar novo produto" aria-label="Criar novo produto" onClick={() => setEditorForProduct(catalogFactoryId, NEW_PRODUCT_VALUE)}><Plus className="h-4 w-4" /></Button></div></div></div><div className="space-y-2"><Label htmlFor="catalog-product-name">Nome do produto</Label><Input id="catalog-product-name" placeholder="Ex.: Pão de sementes" value={catalogProductName} onChange={event => setCatalogProductName(event.target.value)} /><p className="text-xs text-slate-500">Ao alterar o nome, o catálogo passa a usar a nova designação. Os registos já guardados mantêm o seu histórico original.</p>{catalogProductKey !== NEW_PRODUCT_VALUE ? <Button type="button" variant="outline" size="sm" className="mt-3 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={deleteProductConfiguration}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar produto</Button> : null}</div><div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4"><Label htmlFor="packaging-formats">Formatos de embalagem</Label><p className="mt-1 text-xs leading-5 text-teal-800">Defina um formato por linha: <strong>Nome | unidades por unidade de venda | unidades por caixa</strong>. Ex.: Saco 5 un | 5 | 20.</p><Textarea id="packaging-formats" className="mt-3 min-h-24 bg-white" placeholder="Saco 5 un | 5 | 20\nSaco individual | 1 | 30" value={packagingFormatsDraft} onChange={event => setPackagingFormatsDraft(event.target.value)} /></div><div className="space-y-4">{editorPhases.map((item, phaseIndex) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`editor-phase-name-${item.id}`} className="font-semibold text-slate-900">Fase {phaseIndex + 1}</Label><Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeEditorPhase(item.id)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar fase</Button></div><Input id={`editor-phase-name-${item.id}`} aria-label={`Nome da fase ${phaseIndex + 1}`} className="mt-2 bg-white" placeholder="Ex.: Produção" value={item.name} onChange={event => updateEditorPhase(item.id, { name: event.target.value })} /><p className="mt-3 text-xs leading-5 text-slate-600">Indique um ponto por linha. Use «Nome do ponto — parâmetro de referência» quando existir um valor específico a controlar.</p><div className="mt-3 space-y-2">{item.parameters.map((parameter, parameterIndex) => <div key={`${item.id}-${parameterIndex}`} className="flex gap-2"><Input aria-label={`Ponto ${parameterIndex + 1} da fase ${phaseIndex + 1}`} className="bg-white" placeholder="Ex.: Tratamento térmico — 220 ºC / 25 min" value={parameter} onChange={event => updateEditorParameter(item.id, parameterIndex, event.target.value)} /><Button type="button" variant="outline" size="icon" aria-label={`Eliminar ponto ${parameterIndex + 1} da fase ${phaseIndex + 1}`} className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeEditorParameter(item.id, parameterIndex)}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => addEditorParameter(item.id)}><Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar ponto de controlo</Button></div>)}<Button type="button" variant="outline" className="w-full border-dashed" onClick={addEditorPhase}><Plus className="mr-2 h-4 w-4" />Adicionar fase</Button></div><DialogFooter><Button type="button" variant="outline" onClick={() => setCatalogOpen(false)}>Cancelar</Button><Button type="button" onClick={saveProductConfiguration}><Save className="mr-2 h-4 w-4" />Guardar configuração</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
