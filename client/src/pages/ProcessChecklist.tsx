import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROCESS_CONTROL_CATALOG, PROCESS_FACTORY_LABELS, PROCESS_PHASE_LABELS } from "@/lib/processControlCatalog";
import { CheckCircle2, ClipboardCheck, Download, History, Search, Trash2, TriangleAlert } from "lucide-react";
import React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CheckResult = "C" | "NC" | "NA";
type ProcessCheck = { parameter: string; result: CheckResult | ""; observedValue: string; notes: string; correctiveAction: string };
type ProcessRecord = { id: string; createdAt: string; date: string; shift: string; responsible: string; factoryId: string; product: string; lot: string; phase: string; checks: ProcessCheck[]; overallResult: CheckResult };
const STORAGE_KEY = "qualicontrol-process-checklist-v1";
const today = () => new Date().toISOString().slice(0, 10);
const emptyCheck = (parameter: string): ProcessCheck => ({ parameter, result: "", observedValue: "", notes: "", correctiveAction: "" });

function readRecords(): ProcessRecord[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function resultLabel(result: CheckResult | "") { return result === "C" ? "Conforme" : result === "NC" ? "Não conforme" : result === "NA" ? "Não aplicável" : "Por validar"; }

export default function ProcessChecklist() {
  const [factoryId, setFactoryId] = useState("1");
  const [product, setProduct] = useState("");
  const [phase, setPhase] = useState("1");
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState("");
  const [responsible, setResponsible] = useState("");
  const [lot, setLot] = useState("");
  const [checks, setChecks] = useState<ProcessCheck[]>([]);
  const [records, setRecords] = useState<ProcessRecord[]>(readRecords);
  const [historySearch, setHistorySearch] = useState("");

  const products = useMemo(() => Object.keys(PROCESS_CONTROL_CATALOG[factoryId]?.products ?? {}), [factoryId]);
  const parameters = useMemo(() => PROCESS_CONTROL_CATALOG[factoryId]?.products[product]?.[Number(phase) as 1 | 2 | 3] ?? [], [factoryId, product, phase]);
  const filteredRecords = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("pt-PT");
    return records.filter(record => !query || [record.product, record.responsible, record.lot, PROCESS_FACTORY_LABELS[record.factoryId], PROCESS_PHASE_LABELS[record.phase]].join(" ").toLocaleLowerCase("pt-PT").includes(query)).slice(0, 30);
  }, [historySearch, records]);

  const chooseFactory = (value: string) => { setFactoryId(value); setProduct(""); setChecks([]); };
  const chooseProduct = (value: string) => {
    setProduct(value);
    setChecks((PROCESS_CONTROL_CATALOG[factoryId]?.products[value]?.[Number(phase) as 1 | 2 | 3] ?? []).map(emptyCheck));
  };
  const choosePhase = (value: string) => {
    setPhase(value);
    setChecks((PROCESS_CONTROL_CATALOG[factoryId]?.products[product]?.[Number(value) as 1 | 2 | 3] ?? []).map(emptyCheck));
  };
  const updateCheck = (index: number, patch: Partial<ProcessCheck>) => setChecks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const save = () => {
    if (!date || !shift || !responsible.trim() || !product || !checks.length) return toast.error("Preencha a data, turno, responsável, produto e fase antes de guardar.");
    if (checks.some(check => !check.result)) return toast.error("Valide todos os pontos da fase como Conforme, Não conforme ou Não aplicável.");
    if (checks.some(check => check.result === "NC" && !check.correctiveAction.trim())) return toast.error("Para cada ponto Não conforme, indique a ação corretiva ou de contenção.");
    const overallResult: CheckResult = checks.some(check => check.result === "NC") ? "NC" : checks.every(check => check.result === "NA") ? "NA" : "C";
    const entry: ProcessRecord = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date, shift, responsible: responsible.trim(), factoryId, product, lot: lot.trim(), phase, checks, overallResult };
    const next = [entry, ...records]; setRecords(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast[overallResult === "NC" ? "error" : "success"](overallResult === "NC" ? "Checklist guardada com desvio. Registe/acompanhe a ação corretiva." : "Checklist de processo guardada com sucesso.");
    setChecks(parameters.map(emptyCheck));
  };
  const removeRecord = (id: string) => { const next = records.filter(record => record.id !== id); setRecords(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); toast.success("Registo removido do histórico local."); };
  const exportRecords = () => { const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `checklist-processos-${today()}.json`; anchor.click(); URL.revokeObjectURL(url); };

  return <div className="app-grid min-h-full -m-4 space-y-6 bg-slate-50/60 p-4 md:-m-6 md:p-6">
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="font-mono-ui text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Novo controlo operacional</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><ClipboardCheck className="h-7 w-7 text-teal-700" />Checklist de Processos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Acompanhe no terreno a implementação dos parâmetros por produto, fase e turno. O valor de referência é o parâmetro aprovado no catálogo do produto; registe aqui o valor realmente observado.</p></div>
        <Button variant="outline" onClick={exportRecords} disabled={!records.length}><Download className="mr-2 h-4 w-4" />Exportar histórico</Button>
      </div>
      <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex gap-3 p-4 text-sm text-amber-950"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold">Campos a confirmar com a Produção</p><p className="mt-1 leading-6">Confirmar a designação oficial dos turnos, o formato do lote/data de produção e os critérios de aceitação dos pontos finais (unidades por massa, quebras, sobras e caixas por massa). Os valores de gramagem, temperatura, tempo e velocidade são apresentados conforme o ficheiro Excel anexado.</p></div></CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Identificação da verificação</CardTitle><CardDescription>Preencha uma ficha por produto, fase e turno. Pode guardar várias fichas no mesmo dia.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label>Fábrica</Label><Select value={factoryId} onValueChange={chooseFactory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_FACTORY_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Data de produção</Label><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
        <div className="space-y-2"><Label>Horário do turno</Label><Input placeholder="Ex.: 06:00–14:00 / Turno A" value={shift} onChange={event => setShift(event.target.value)} /></div>
        <div className="space-y-2"><Label>Responsável do turno</Label><Input placeholder="Nome do responsável" value={responsible} onChange={event => setResponsible(event.target.value)} /></div>
        <div className="space-y-2 lg:col-span-2"><Label>Produto</Label><Select value={product} onValueChange={chooseProduct}><SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger><SelectContent>{products.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Fase</Label><Select value={phase} onValueChange={choosePhase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROCESS_PHASE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Lote / referência</Label><Input placeholder="Lote a confirmar com Produção" value={lot} onChange={event => setLot(event.target.value)} /></div>
      </CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><CardTitle>{product ? `${PROCESS_PHASE_LABELS[phase]} · ${product}` : "Parâmetros da fase"}</CardTitle><CardDescription>{product ? "Consulte a referência aprovada e registe o valor observado, decisão e ação corretiva." : "Selecione fábrica, produto e fase para carregar os parâmetros."}</CardDescription></div>{checks.length ? <Badge variant="outline">{checks.length} ponto(s)</Badge> : null}</div></CardHeader><CardContent className="space-y-3">
        {!checks.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Ainda não existem pontos carregados para preencher.</div> : checks.map((check, index) => <div key={`${check.parameter}-${index}`} className={`rounded-xl border p-4 ${check.result === "NC" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}><div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_minmax(0,1fr)] lg:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ponto {index + 1}</p><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{check.parameter}</p><p className="mt-1 text-xs leading-5 text-teal-800"><span className="font-semibold">Referência:</span> consultar o parâmetro aprovado acima; não alterar o catálogo nesta ficha.</p></div><div className="space-y-2"><Label htmlFor={`observed-${index}`}>Valor observado</Label><Input id={`observed-${index}`} placeholder="Valor / confirmação" value={check.observedValue} onChange={event => updateCheck(index, { observedValue: event.target.value })} /></div><div className="space-y-2"><Label>Validação</Label><div className="grid grid-cols-3 gap-1">{(["C", "NC", "NA"] as CheckResult[]).map(result => <Button key={result} type="button" size="sm" variant={check.result === result ? result === "NC" ? "destructive" : "default" : "outline"} onClick={() => updateCheck(index, { result })}>{result}</Button>)}</div><p className="text-[11px] text-slate-500">{resultLabel(check.result)}</p></div><div className="space-y-2"><Label htmlFor={`notes-${index}`}>Observações</Label><Textarea id={`notes-${index}`} rows={2} placeholder="Evidência, desvio ou observação" value={check.notes} onChange={event => updateCheck(index, { notes: event.target.value })} /></div></div>{check.result === "NC" ? <div className="mt-3 space-y-2"><Label htmlFor={`action-${index}`}>Ação corretiva / contenção</Label><Textarea id={`action-${index}`} rows={2} placeholder="Ação imediata, responsável e prazo" value={check.correctiveAction} onChange={event => updateCheck(index, { correctiveAction: event.target.value })} /></div> : null}</div>)}
        {checks.length ? <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Uma decisão NC fica guardada no histórico local com o desvio e a ação corretiva introduzida.</p><Button size="lg" onClick={save}><CheckCircle2 className="mr-2 h-4 w-4" />Guardar checklist</Button></div> : null}
      </CardContent></Card>
      <Card className="border-0 shadow-sm"><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-teal-700" />Histórico local de checklists</CardTitle><CardDescription>Registos preservados neste dispositivo. Inclua-os no Backup JSON da aplicação.</CardDescription></div><div className="relative w-full md:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Pesquisar produto, lote ou responsável" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /></div></div></CardHeader><CardContent>{filteredRecords.length ? <div className="space-y-2">{filteredRecords.map(record => <div key={record.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{record.product}</p><Badge className={record.overallResult === "NC" ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{resultLabel(record.overallResult)}</Badge></div><p className="mt-1 text-xs text-slate-600">{PROCESS_FACTORY_LABELS[record.factoryId]} · {PROCESS_PHASE_LABELS[record.phase]} · {record.date} · {record.shift}</p><p className="mt-1 text-xs text-slate-500">Responsável: {record.responsible}{record.lot ? ` · Lote: ${record.lot}` : ""} · {record.checks.length} ponto(s)</p></div><Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeRecord(record.id)}><Trash2 className="mr-1.5 h-4 w-4" />Eliminar</Button></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Ainda não existem registos guardados neste dispositivo.</div>}</CardContent></Card>
    </section>
  </div>;
}
