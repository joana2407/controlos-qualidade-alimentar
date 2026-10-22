import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { PROCESS_CONTROL_CATALOG, PROCESS_FACTORY_LABELS, PROCESS_PHASE_LABELS, type ProcessCatalog, type ProcessPhase } from "@/lib/processControlCatalog";
import { CheckCircle2, ClipboardCheck, Download, History, Pencil, Plus, Save, Search, Settings2, Trash2, TriangleAlert } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

type CheckResult = "C" | "NC" | "NA";
type LotFieldKey = "mp" | "lot" | "expiry";
type LotField = { value: string; result: Exclude<CheckResult, "NA"> | "" };
type LotRow = Record<LotFieldKey, LotField>;
type ProcessCheck = { parameter: string; result: CheckResult | ""; observedValue: string; notes: string; correctiveAction: string; lotRows?: LotRow[] };
type ProcessRecord = { id: string; createdAt: string; date: string; shift: string; responsible: string; factoryId: string; product: string; recipeCode: string; lot: string; phase: string; checks: ProcessCheck[]; overallResult: CheckResult };
type PhaseDrafts = Record<ProcessPhase, string>;
type CatalogStorage = { version: 1; catalog: ProcessCatalog };

const STORAGE_KEY = "qualicontrol-process-checklist-v1";
const CATALOG_STORAGE_KEY = "qualicontrol-process-catalog-v1";
const NEW_PRODUCT_VALUE = "__novo_produto__";
const PHASES: ProcessPhase[] = [1, 2, 3];

const today = () => new Date().toISOString().slice(0, 10);
const isLotVerification = (parameter: string) => parameter.toLocaleLowerCase("pt-PT").includes("lote");
const emptyLotRow = (): LotRow => ({ mp: { value: "", result: "" }, lot: { value: "", result: "" }, expiry: { value: "", result: "" } });
const emptyCheck = (parameter: string): ProcessCheck => ({ parameter, result: "", observedValue: "", notes: "", correctiveAction: "", ...(isLotVerification(parameter) ? { lotRows: [emptyLotRow()] } : {}) });
const cloneCatalog = (catalog: ProcessCatalog): ProcessCatalog => JSON.parse(JSON.stringify(catalog)) as ProcessCatalog;
const emptyPhaseDrafts = (): PhaseDrafts => ({ 1: "", 2: "", 3: "" });
const listToDrafts = (product?: Record<ProcessPhase, string[]>): PhaseDrafts => ({
  1: product?.[1]?.join("\n") ?? "",
  2: product?.[2]?.join("\n") ?? "",
  3: product?.[3]?.join("\n") ?? "",
});
const linesToParameters = (value: string) => value.split("\n").map((parameter) => parameter.trim()).filter(Boolean);

function isCatalog(value: unknown): value is ProcessCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["1", "2", "3"].every((factoryId) => {
    const factory = candidate[factoryId] as { sheet?: unknown; products?: unknown } | undefined;
    return Boolean(factory && typeof factory.sheet === "string" && factory.products && typeof factory.products === "object");
  });
}

function readCatalog(): ProcessCatalog {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY) ?? "null") as Partial<CatalogStorage> | null;
    return parsed?.version === 1 && isCatalog(parsed.catalog) ? parsed.catalog : cloneCatalog(PROCESS_CONTROL_CATALOG);
  } catch {
    return cloneCatalog(PROCESS_CONTROL_CATALOG);
  }
}

function readRecords(): ProcessRecord[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function resultLabel(result: CheckResult | "") { return result === "C" ? "Conforme" : result === "NC" ? "Não conforme" : result === "NA" ? "Não aplicável" : "Por validar"; }

export default function ProcessChecklist() {
  const { canManage } = useQualityAccess();
  const [catalog, setCatalog] = useState<ProcessCatalog>(readCatalog);
  const [factoryId, setFactoryId] = useState("1");
  const [product, setProduct] = useState("");
  const [phase, setPhase] = useState("1");
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState("");
  const [responsible, setResponsible] = useState("");
  const [recipeCode, setRecipeCode] = useState("");
  const [lot, setLot] = useState("");
  const [checks, setChecks] = useState<ProcessCheck[]>([]);
  const [records, setRecords] = useState<ProcessRecord[]>(readRecords);
  const [historySearch, setHistorySearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFactoryId, setCatalogFactoryId] = useState("1");
  const [catalogProductKey, setCatalogProductKey] = useState(NEW_PRODUCT_VALUE);
  const [catalogProductName, setCatalogProductName] = useState("");
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDrafts>(emptyPhaseDrafts);

  const products = useMemo(() => Object.keys(catalog[factoryId]?.products ?? {}), [catalog, factoryId]);
  const parameters = useMemo(() => catalog[factoryId]?.products[product]?.[Number(phase) as ProcessPhase] ?? [], [catalog, factoryId, product, phase]);
  const catalogProducts = useMemo(() => Object.keys(catalog[catalogFactoryId]?.products ?? {}), [catalog, catalogFactoryId]);
  const filteredRecords = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("pt-PT");
    return records.filter(record => !query || [record.product, record.recipeCode, record.responsible, record.lot, PROCESS_FACTORY_LABELS[record.factoryId], PROCESS_PHASE_LABELS[record.phase]].join(" ").toLocaleLowerCase("pt-PT").includes(query)).slice(0, 30);
  }, [historySearch, records]);

  const setDraftForProduct = (nextFactoryId: string, nextProductKey: string) => {
    setCatalogProductKey(nextProductKey);
    const selectedProduct = nextProductKey === NEW_PRODUCT_VALUE ? undefined : catalog[nextFactoryId]?.products[nextProductKey];
    setCatalogProductName(nextProductKey === NEW_PRODUCT_VALUE ? "" : nextProductKey);
    setPhaseDrafts(listToDrafts(selectedProduct));
  };

  const chooseFactory = (value: string) => { setFactoryId(value); setProduct(""); setChecks([]); };
  const chooseProduct = (value: string) => {
    setProduct(value);
    setChecks((catalog[factoryId]?.products[value]?.[Number(phase) as ProcessPhase] ?? []).map(emptyCheck));
  };
  const choosePhase = (value: string) => {
    setPhase(value);
    setChecks((catalog[factoryId]?.products[product]?.[Number(value) as ProcessPhase] ?? []).map(emptyCheck));
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

  const openCatalogManager = () => {
    const managerFactoryId = factoryId;
    const initialProduct = product && catalog[managerFactoryId]?.products[product] ? product : Object.keys(catalog[managerFactoryId]?.products ?? {})[0] ?? NEW_PRODUCT_VALUE;
    setCatalogFactoryId(managerFactoryId);
    setDraftForProduct(managerFactoryId, initialProduct);
    setCatalogOpen(true);
  };

  const saveProductConfiguration = () => {
    if (!canManage) return toast.error("Apenas a Responsável de Qualidade pode alterar o catálogo de processos.");
    const normalizedName = catalogProductName.trim().replace(/\s+/g, " ");
    const nextPhases = PHASES.reduce((result, currentPhase) => ({ ...result, [currentPhase]: linesToParameters(phaseDrafts[currentPhase]) }), {} as Record<ProcessPhase, string[]>);
    if (!normalizedName) return toast.error("Indique o nome do produto.");
    const missingPhase = PHASES.find((currentPhase) => !nextPhases[currentPhase].length);
    if (missingPhase) return toast.error(`Defina pelo menos um parâmetro para a ${PROCESS_PHASE_LABELS[missingPhase]}.`);
    const nextCatalog = cloneCatalog(catalog);
    const targetProducts = nextCatalog[catalogFactoryId].products;
    if (catalogProductKey !== NEW_PRODUCT_VALUE && catalogProductKey !== normalizedName) delete targetProducts[catalogProductKey];
    if (catalogProductKey === NEW_PRODUCT_VALUE && targetProducts[normalizedName]) return toast.error("Já existe um produto com este nome nesta fábrica. Selecione-o para editar.");
    if (catalogProductKey !== NEW_PRODUCT_VALUE && catalogProductKey !== normalizedName && targetProducts[normalizedName]) return toast.error("Já existe outro produto com este nome nesta fábrica.");
    targetProducts[normalizedName] = nextPhases;
    const storage: CatalogStorage = { version: 1, catalog: nextCatalog };
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(storage));
    setCatalog(nextCatalog);
    setCatalogProductKey(normalizedName);
    setCatalogProductName(normalizedName);
    setPhaseDrafts(listToDrafts(nextPhases));
    if (factoryId === catalogFactoryId && (product === catalogProductKey || catalogProductKey === NEW_PRODUCT_VALUE)) {
      setProduct(normalizedName);
      setChecks((nextPhases[Number(phase) as ProcessPhase] ?? []).map(emptyCheck));
    }
    toast.success(catalogProductKey === NEW_PRODUCT_VALUE ? "Novo produto criado com as três fases configuradas." : "Configuração do produto atualizada.");
  };

  const save = () => {
    if (!date || !shift || !responsible.trim() || !product || !checks.length) return toast.error("Preencha a data, turno, responsável, produto e fase antes de guardar.");
    if (checks.some(check => isLotVerification(check.parameter) && (!check.lotRows?.length || check.lotRows.some(row => Object.values(row).some(field => !field.value.trim() || !field.result))))) return toast.error("No ponto de lotes, preencha todas as MP, os respetivos lotes e validades e valide cada campo como C ou NC.");
    if (checks.some(check => !check.result)) return toast.error("Valide todos os pontos da fase como Conforme, Não conforme ou Não aplicável.");
    if (checks.some(check => check.result === "NC" && !check.correctiveAction.trim())) return toast.error("Para cada ponto Não conforme, indique a ação corretiva ou de contenção.");
    const overallResult: CheckResult = checks.some(check => check.result === "NC") ? "NC" : checks.every(check => check.result === "NA") ? "NA" : "C";
    const entry: ProcessRecord = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date, shift, responsible: responsible.trim(), factoryId, product, recipeCode: recipeCode.trim(), lot: lot.trim(), phase, checks, overallResult };
    const next = [entry, ...records]; setRecords(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast[overallResult === "NC" ? "error" : "success"](overallResult === "NC" ? "Checklist guardada com desvio. Registe/acompanhe a ação corretiva." : "Checklist de processo guardada com sucesso.");
    setChecks(parameters.map(emptyCheck));
  };

  const removeRecord = (id: string) => { const next = records.filter(record => record.id !== id); setRecords(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); toast.success("Registo removido do histórico local."); };
  const exportRecords = () => { const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `checklist-processos-${today()}.json`; anchor.click(); URL.revokeObjectURL(url); };

  const renderCheck = (check: ProcessCheck, index: number) => {
    const lotRows = check.lotRows;
    if (lotRows) {
      const lotFieldDefinitions: Array<{ key: LotFieldKey; label: string; placeholder: string; type?: string }> = [
        { key: "mp", label: "MP", placeholder: "Matéria-prima" },
        { key: "lot", label: "Lote", placeholder: "Referência do lote" },
        { key: "expiry", label: "Validade", placeholder: "Data de validade", type: "date" },
      ];
      return <div key={`${check.parameter}-${index}`} className={`rounded-xl border p-4 ${check.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ponto {index + 1}</p><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{check.parameter}</p><p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Validação individual obrigatória:</span> cada MP deve ter o seu lote e validade confirmados.</p></div><Button type="button" size="sm" variant="outline" onClick={() => addLotRow(index)}><Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar MP</Button></div>
        <div className="space-y-3">{lotRows.map((row, rowIndex) => <div key={rowIndex} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Matéria-prima {rowIndex + 1}</p>{lotRows.length > 1 ? <Button type="button" size="sm" variant="ghost" className="h-7 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeLotRow(index, rowIndex)}>Remover</Button> : null}</div><div className="grid gap-3 lg:grid-cols-3">{lotFieldDefinitions.map(field => <div key={field.key}><Label htmlFor={`lot-${field.key}-${index}-${rowIndex}`}>{field.label}</Label><Input id={`lot-${field.key}-${index}-${rowIndex}`} type={field.type ?? "text"} placeholder={field.placeholder} value={row[field.key].value} onChange={event => updateLotField(index, rowIndex, field.key, { value: event.target.value })} className="mt-2 bg-white" /><p className="mt-3 text-xs font-medium text-slate-600">Validação de {field.label}</p><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" size="sm" variant={row[field.key].result === "C" ? "default" : "outline"} onClick={() => updateLotField(index, rowIndex, field.key, { result: "C" })}>C</Button><Button type="button" size="sm" variant={row[field.key].result === "NC" ? "destructive" : "outline"} onClick={() => updateLotField(index, rowIndex, field.key, { result: "NC" })}>NC</Button></div><p className="mt-1 text-[11px] text-slate-500">{resultLabel(row[field.key].result)}</p></div>)}</div></div>)}</div>
        <div className="mt-3 space-y-2"><Label htmlFor={`notes-${index}`}>Observações</Label><Textarea id={`notes-${index}`} rows={2} placeholder="Evidência, desvio ou observação" value={check.notes} onChange={event => updateCheck(index, { notes: event.target.value })} /></div>
        {check.result === "NC" ? <div className="mt-3 space-y-2"><Label htmlFor={`action-${index}`}>Ação corretiva / contenção</Label><Textarea id={`action-${index}`} rows={2} placeholder="Ação imediata, responsável e prazo" value={check.correctiveAction} onChange={event => updateCheck(index, { correctiveAction: event.target.value })} /></div> : null}
      </div>;
    }
    return <div key={`${check.parameter}-${index}`} className={`rounded-xl border p-4 ${check.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}><div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_minmax(0,1fr)] lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ponto {index + 1}</p><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{check.parameter}</p><p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Referência:</span> consultar o parâmetro aprovado acima; não alterar o catálogo nesta ficha.</p></div><div className="space-y-2"><Label htmlFor={`observed-${index}`}>Valor observado</Label><Input id={`observed-${index}`} placeholder="Valor / confirmação" value={check.observedValue} onChange={event => updateCheck(index, { observedValue: event.target.value })} /></div><div className="space-y-2"><Label>Validação</Label><div className="grid grid-cols-3 gap-1">{(["C", "NC", "NA"] as CheckResult[]).map(result => <Button key={result} type="button" size="sm" variant={check.result === result ? result === "NC" ? "destructive" : "default" : "outline"} onClick={() => updateCheck(index, { result })}>{result}</Button>)}</div><p className="text-[11px] text-slate-500">{resultLabel(check.result)}</p></div><div className="space-y-2"><Label htmlFor={`notes-${index}`}>Observações</Label><Textarea id={`notes-${index}`} rows={2} placeholder="Evidência, desvio ou observação" value={check.notes} onChange={event => updateCheck(index, { notes: event.target.value })} /></div></div>{check.result === "NC" ? <div className="mt-3 space-y-2"><Label htmlFor={`action-${index}`}>Ação corretiva / contenção</Label><Textarea id={`action-${index}`} rows={2} placeholder="Ação imediata, responsável e prazo" value={check.correctiveAction} onChange={event => updateCheck(index, { correctiveAction: event.target.value })} /></div> : null}</div>;
  };

  return <div className="app-grid min-h-full -m-4 space-y-6 bg-slate-50/60 p-4 md:-m-6 md:p-6">
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Novo controlo operacional</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><ClipboardCheck className="h-7 w-7 text-teal-700" />Checklist de Processos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Acompanhe no terreno a implementação dos parâmetros por produto, fase e turno. O valor de referência é o parâmetro aprovado no catálogo do produto; registe aqui o valor realmente observado.</p></div><div className="flex flex-wrap gap-2">{canManage ? <Button variant="outline" onClick={openCatalogManager}><Settings2 className="mr-2 h-4 w-4" />Gerir produtos e parâmetros</Button> : null}<Button variant="outline" onClick={exportRecords} disabled={!records.length}><Download className="mr-2 h-4 w-4" />Exportar histórico</Button></div></div>
      {canManage ? <Card className="border-teal-100 bg-teal-50/45"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-teal-950">Catálogo configurável pela Responsável de Qualidade</p><p className="mt-1 text-xs leading-5 text-teal-800">Pode editar os parâmetros de qualquer produto e fase ou criar produtos novos. As alterações ficam guardadas neste dispositivo e seguem na cópia local de segurança.</p></div><Button size="sm" variant="outline" className="border-teal-200 bg-white text-teal-900 hover:bg-teal-100" onClick={openCatalogManager}><Pencil className="mr-1.5 h-3.5 w-3.5" />Abrir catálogo</Button></CardContent></Card> : null}
      <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex gap-3 p-4 text-sm text-amber-950"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold">Campos a confirmar com a Produção</p><p className="mt-1 leading-6">Confirmar a designação oficial dos turnos, o formato do lote/data de produção e os critérios de aceitação dos pontos finais (unidades por massa, quebras, sobras e caixas por massa). Os valores de gramagem, temperatura, tempo e velocidade são apresentados conforme o ficheiro Excel anexado.</p></div></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Identificação da verificação</CardTitle><CardDescription>Preencha uma ficha por produto, fase e turno. Pode guardar várias fichas no mesmo dia.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label>Fábrica</Label><Select value={factoryId} onValueChange={chooseFactory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_FACTORY_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Data de produção</Label><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></div><div className="space-y-2"><Label>Horário do turno</Label><Input placeholder="Ex.: 06:00–14:00 / Turno A" value={shift} onChange={event => setShift(event.target.value)} /></div><div className="space-y-2"><Label>Responsável do turno</Label><Input placeholder="Nome do responsável" value={responsible} onChange={event => setResponsible(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="recipe-code">Código da receita</Label><Input id="recipe-code" placeholder="Ex.: REC-001" value={recipeCode} onChange={event => setRecipeCode(event.target.value)} /></div><div className="space-y-2 lg:col-span-2"><Label>Produto</Label><Select value={product} onValueChange={chooseProduct}><SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger><SelectContent>{products.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Fase</Label><Select value={phase} onValueChange={choosePhase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_PHASE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Lote / referência</Label><Input placeholder="Lote a confirmar com Produção" value={lot} onChange={event => setLot(event.target.value)} /></div></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><CardTitle>{product ? `${PROCESS_PHASE_LABELS[phase]} · ${product}` : "Parâmetros da fase"}</CardTitle><CardDescription>{product ? "Consulte a referência aprovada e registe o valor observado, decisão e ação corretiva." : "Selecione fábrica, produto e fase para carregar os parâmetros."}</CardDescription></div>{checks.length ? <Badge variant="outline">{checks.length} ponto(s)</Badge> : null}</div></CardHeader><CardContent className="space-y-3">{!checks.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Ainda não existem pontos carregados para preencher.</div> : checks.map(renderCheck)}{checks.length ? <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Uma decisão NC fica guardada no histórico local com o desvio e a ação corretiva introduzida.</p><Button size="lg" onClick={save}><CheckCircle2 className="mr-2 h-4 w-4" />Guardar checklist</Button></div> : null}</CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-teal-700" />Histórico local de checklists</CardTitle><CardDescription>Registos preservados neste dispositivo. Inclua-os no Backup JSON da aplicação.</CardDescription></div><div className="relative w-full md:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Pesquisar produto, receita, lote ou responsável" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /></div></div></CardHeader><CardContent>{filteredRecords.length ? <div className="space-y-2">{filteredRecords.map(record => <div key={record.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{record.product}</p><Badge className={record.overallResult === "NC" ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{resultLabel(record.overallResult)}</Badge></div><p className="mt-1 text-xs text-slate-600">{PROCESS_FACTORY_LABELS[record.factoryId]} · {PROCESS_PHASE_LABELS[record.phase]} · {record.date} · {record.shift}</p><p className="mt-1 text-xs text-slate-500">Responsável: {record.responsible}{record.recipeCode ? ` · Receita: ${record.recipeCode}` : ""}{record.lot ? ` · Lote: ${record.lot}` : ""} · {record.checks.length} ponto(s)</p></div><Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeRecord(record.id)}><Trash2 className="mr-1.5 h-4 w-4" />Eliminar</Button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Ainda não existem registos guardados neste dispositivo.</div>}</CardContent></Card>
    </section>

    <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Catálogo de produtos e parâmetros</DialogTitle><DialogDescription>Disponível exclusivamente para a Responsável de Qualidade. Defina uma linha por parâmetro; cada produto deve ter configuração nas três fases.</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="catalog-factory">Fábrica</Label><Select value={catalogFactoryId} onValueChange={(value) => { setCatalogFactoryId(value); setDraftForProduct(value, Object.keys(catalog[value]?.products ?? {})[0] ?? NEW_PRODUCT_VALUE); }}><SelectTrigger id="catalog-factory"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_FACTORY_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="catalog-product">Produto a configurar</Label><div className="flex gap-2"><Select value={catalogProductKey} onValueChange={(value) => setDraftForProduct(catalogFactoryId, value)}><SelectTrigger id="catalog-product"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NEW_PRODUCT_VALUE}>Novo produto…</SelectItem>{catalogProducts.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" size="icon" title="Criar novo produto" aria-label="Criar novo produto" onClick={() => setDraftForProduct(catalogFactoryId, NEW_PRODUCT_VALUE)}><Plus className="h-4 w-4" /></Button></div></div></div><div className="space-y-2"><Label htmlFor="catalog-product-name">Nome do produto</Label><Input id="catalog-product-name" placeholder="Ex.: Pão de sementes" value={catalogProductName} onChange={(event) => setCatalogProductName(event.target.value)} /><p className="text-xs text-slate-500">Ao alterar o nome de um produto existente, o catálogo passa a usar a nova designação. Os registos já guardados mantêm o seu histórico original.</p></div><div className="space-y-4">{PHASES.map((currentPhase) => <div key={currentPhase} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><Label htmlFor={`phase-${currentPhase}`} className="font-semibold text-slate-900">{PROCESS_PHASE_LABELS[currentPhase]}</Label><p className="mt-1 text-xs leading-5 text-slate-600">Escreva um parâmetro por linha. Inclua referências de gramagem, tempo, temperatura, velocidade e operações a controlar.</p><Textarea id={`phase-${currentPhase}`} className="mt-3 min-h-32 bg-white" placeholder="Um parâmetro por linha" value={phaseDrafts[currentPhase]} onChange={(event) => setPhaseDrafts((current) => ({ ...current, [currentPhase]: event.target.value }))} /></div>)}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setCatalogOpen(false)}>Cancelar</Button><Button type="button" onClick={saveProductConfiguration}><Save className="mr-2 h-4 w-4" />Guardar configuração</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
