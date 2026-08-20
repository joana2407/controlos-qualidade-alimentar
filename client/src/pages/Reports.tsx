import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OperatorAttribution } from "@/components/quality/OperatorAttribution";
import { dateFormat, moduleLabel, MODULES } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { BarChart3, Download, Eye, FileWarning, RotateCcw, Search, Target, TrendingUp } from "lucide-react";
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "./reports-redesign.css";

type DetailRow = { label: string; value: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  const translated = { positive: "Positivo", negative: "Negativo", conform: "Conforme", nonconform: "Não conforme", open: "Aberta", in_progress: "Em tratamento", awaiting_validation: "A aguardar validação", closed: "Fechada", pending: "Pendente", completed: "Concluída", ambiente: "Ambiente", congelado: "Congelado" }[String(value).toLowerCase()];
  return translated ?? String(value);
}

function humanLabel(value: string): string {
  const translated = { collaboratorId: "Identificador do colaborador", collaboratorName: "Colaborador inspecionado", criterion: "Critério verificado", criterioLimpeza: "Critério de limpeza", observacao: "Observação", analyst: "Analista", analystProfileId: "Identificador do analista", category: "Categoria", photos: "Fotografias", samples: "Amostras", controlResult: "Resultado do controlo", fileName: "Nome do ficheiro", mimeType: "Tipo de ficheiro", samplePoint: "Ponto de amostragem", product: "Produto", lot: "Lote", result: "Resultado", label: "Designação", test: "Teste", profileLabel: "Perfil", temperatureLimits: "Limites de temperatura", sourceOrderDocument: "Documento da encomenda", orderNumber: "N.º da encomenda", customer: "Cliente", deliveryNote: "Guia de transporte", observations: "Observações", evidencePhotos: "Fotografias de evidência" }[value];
  return translated ?? value.replace(/([A-Z])/g, " $1").replace(/[._]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function flattenPayload(value: unknown, prefix = ""): DetailRow[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenPayload(item, `${prefix}${prefix ? " · " : ""}${index + 1}`));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (["key", "url", "mimeType", "collaboratorId", "analystProfileId", "fileName"].includes(key)) return [];
    if (["photos", "evidencePhotos"].includes(key) && Array.isArray(item)) return item.length ? [{ label: humanLabel(key), value: `${item.length} fotografia${item.length === 1 ? "" : "s"} anexada${item.length === 1 ? "" : "s"}` }] : [];
    return flattenPayload(item, `${prefix}${prefix ? " · " : ""}${humanLabel(key)}`);
  });
  return [{ label: prefix || "Dados registados", value: displayValue(value) }];
}

function ResultBadge({ value }: { value: string | null | undefined }) {
  const className = value === "NC" ? "bg-red-600 text-white hover:bg-red-600" : value === "C" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={className}>{value ?? "—"}</Badge>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: string | number; tone: "teal" | "amber" | "red" }) {
  const colors = { teal: "bg-teal-50 text-teal-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" }[tone];
  return <Card className="border-0 panel-shadow"><CardContent className="flex items-center gap-4 p-5"><div className={`rounded-xl p-3 ${colors}`}><Icon className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="font-mono-ui mt-1 text-3xl font-semibold">{value}</p></div></CardContent></Card>;
}

function DetailList({ payload }: { payload: unknown }) {
  const details = flattenPayload(asRecord(payload));
  if (!details.length) return <p className="text-sm text-muted-foreground">Sem campos adicionais registados.</p>;
  return <dl className="grid gap-x-5 gap-y-2 text-sm md:grid-cols-2">{details.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-2 border-b border-slate-100 py-2"><dt className="font-medium text-slate-600">{item.label}</dt><dd className="break-words text-slate-900">{item.value}</dd></div>)}</dl>;
}

function EntryCard({ entry, factoryName, onDetail }: { entry: any; factoryName: (id: number | null | undefined) => string; onDetail: (entry: any) => void }) {
  return <article className="px-6 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-slate-950">{entry.title}</p><p className="mt-1 text-sm text-muted-foreground">{moduleLabel(entry.module)} · {factoryName(entry.factoryId)} · {entry.area} · {dateFormat(entry.completedAt)}</p><OperatorAttribution name={entry.registeredByName} title={entry.registeredByTitle} /></div><div className="flex items-center gap-2"><ResultBadge value={entry.result} /><Button size="sm" variant="outline" onClick={() => onDetail(entry)}><Eye className="mr-1 h-3.5 w-3.5" />Abrir detalhe</Button></div></div></article>;
}

function downloadFullWorkbook(entries: any[], incidences: any[], factoryName: (id: number | null | undefined) => string, filters: Record<string, string>) {
  const workbook = XLSX.utils.book_new();
  const rowForEntry = (entry: any, type: string) => ({
    Tipo: type,
    Data: dateFormat(entry.completedAt),
    "Fábrica / linha": factoryName(entry.factoryId),
    Controlo: moduleLabel(entry.module),
    Área: entry.area,
    Resultado: entry.result ?? "",
    Título: entry.title,
    "Registado por": entry.registeredByName ?? "",
    Função: entry.registeredByTitle ?? "",
    Observações: entry.notes ?? "",
    ...Object.fromEntries(flattenPayload(asRecord(entry.payload)).map((detail) => [`Detalhe · ${detail.label}`, detail.value])),
  });
  const summaryRows = Object.entries(filters).filter(([, value]) => value).map(([label, value]) => ({ Filtro: label, Valor: value }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ Filtro: "Filtros", Valor: "Sem filtros adicionais" }]), "Filtros");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(entries.map((entry) => rowForEntry(entry, "Controlo"))), "Controlos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incidences.map((entry) => rowForEntry(entry, "Incidência"))), "Incidências");
  XLSX.writeFile(workbook, "relatorio-operacional-filtrado.xlsx", { compression: true });
}

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const [factoryId, setFactoryId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [module, setModule] = useState("");
  const [result, setResult] = useState("");
  const [ncStatus, setNcStatus] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [analysisProduct, setAnalysisProduct] = useState("");
  const [analysisLot, setAnalysisLot] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const metadata = trpc.quality.metadata.useQuery();
  const queryInput = useMemo(() => ({ factoryId: factoryId ? Number(factoryId) : undefined, startDate: startDate ? new Date(`${startDate}T12:00:00`) : undefined, endDate: endDate ? new Date(`${endDate}T12:00:00`) : undefined, module: module ? module as (typeof MODULES)[number]["id"] : undefined, result: result ? result as "C" | "NC" | "N/A" : undefined, ncStatus: ncStatus ? ncStatus as "open" | "in_progress" | "awaiting_validation" | "closed" : undefined, orderNumber: orderNumber || undefined, analysisProduct: analysisProduct || undefined, analysisLot: analysisLot || undefined }), [analysisLot, analysisProduct, endDate, factoryId, module, ncStatus, orderNumber, result, startDate]);
  const reports = trpc.quality.reports.useQuery(queryInput);
  const data = reports.data;
  const entries = data?.filteredEntries ?? [];
  const incidences = entries.filter((entry) => entry.result === "NC");
  const selectedFactory = metadata.data?.factories.find((factory) => String(factory.id) === factoryId)?.name ?? "Todas as fábricas e linhas";
  const isInternalAnalysis = module === "internal_analysis";
  const maxTrend = Math.max(...(data?.trends.map((item) => item.entries) ?? [1]), 1);
  const factoryName = (id: number | null | undefined) => metadata.data?.factories.find((factory) => factory.id === id)?.name ?? (id ? `Fábrica / linha ${id}` : "Controlo comum");
  const resetFilters = () => { setFactoryId(""); setStartDate(today); setEndDate(today); setModule(""); setResult(""); setNcStatus(""); setOrderNumber(""); setAnalysisProduct(""); setAnalysisLot(""); };
  const filterLabels = { "Data inicial": startDate, "Data final": endDate, "Fábrica / linha": selectedFactory, Controlo: module ? moduleLabel(module) : "Todos os controlos", Resultado: result || "Todos os resultados", "Estado da NC": ncStatus || "Todos os estados", Encomenda: orderNumber, "Produto ou ponto": analysisProduct, Lote: analysisLot };

  return <div className="reports-redesign app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-7xl space-y-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Consulta operacional</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Relatórios</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Um único conjunto de filtros controla controlos, incidências, indicadores e a exportação Excel.</p></div><Button onClick={() => downloadFullWorkbook(entries, incidences, factoryName, filterLabels)} disabled={!entries.length}><Download className="mr-2 h-4 w-4" />Exportar Excel completo</Button></header>

    <Card className="border-0 panel-shadow"><CardHeader className="flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-teal-700" />Filtros do relatório</CardTitle><CardDescription>Os filtros selecionados são aplicados a toda a informação apresentada nesta página.</CardDescription></div><Button size="sm" variant="ghost" onClick={resetFilters}><RotateCcw className="mr-1 h-3.5 w-3.5" />Limpar filtros</Button></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-1"><label className="text-xs font-medium">Fábrica / linha</label><Select value={factoryId || "all"} onValueChange={(value) => setFactoryId(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{(metadata.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><label className="text-xs font-medium">Data inicial</label><Input aria-label="Data inicial da análise" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} /></div><div className="space-y-1"><label className="text-xs font-medium">Data final</label><Input aria-label="Data final da análise" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div><div className="space-y-1"><label className="text-xs font-medium">Controlo</label><Select value={module || "all"} onValueChange={(value) => { const next = value === "all" ? "" : value; setModule(next); if (next !== "internal_analysis") { setAnalysisProduct(""); setAnalysisLot(""); } }}><SelectTrigger aria-label="Filtrar análise por controlo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os controlos</SelectItem>{MODULES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><label className="text-xs font-medium">Resultado</label><Select value={result || "all"} onValueChange={(value) => setResult(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os resultados</SelectItem><SelectItem value="C">Conforme (C)</SelectItem><SelectItem value="NC">Não conforme (NC)</SelectItem><SelectItem value="N/A">Não aplicável (N/A)</SelectItem></SelectContent></Select></div><div className="space-y-1"><label className="text-xs font-medium">Estado da NC</label><Select value={ncStatus || "all"} onValueChange={(value) => setNcStatus(value === "all" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os estados</SelectItem><SelectItem value="open">Aberta</SelectItem><SelectItem value="in_progress">Em tratamento</SelectItem><SelectItem value="awaiting_validation">A aguardar validação</SelectItem><SelectItem value="closed">Fechada</SelectItem></SelectContent></Select></div>{module === "dispatch_control" ? <div className="space-y-1"><label className="text-xs font-medium">N.º encomenda</label><Select value={orderNumber || "all"} onValueChange={(value) => setOrderNumber(value === "all" ? "" : value)}><SelectTrigger><SelectValue placeholder="Todas as encomendas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as encomendas</SelectItem>{(data?.dispatchOrders ?? []).map((order) => <SelectItem key={order.orderNumber} value={order.orderNumber}>{order.orderNumber} · {order.customer ?? "Sem cliente"}</SelectItem>)}</SelectContent></Select></div> : null}</div>{isInternalAnalysis ? <div className="grid gap-3 rounded-xl border border-violet-100 bg-violet-50/50 p-4 md:grid-cols-2"><div className="space-y-1"><label className="text-xs font-medium text-violet-900">Produto ou ponto de amostragem</label><Input value={analysisProduct} onChange={(event) => setAnalysisProduct(event.target.value)} placeholder="Ex.: bancada, farinha, pão" /></div><div className="space-y-1"><label className="text-xs font-medium text-violet-900">Lote</label><Input value={analysisLot} onChange={(event) => setAnalysisLot(event.target.value)} placeholder="Identificação do lote" /></div></div> : null}</CardContent></Card>

    <div className="grid gap-4 md:grid-cols-3"><Metric icon={BarChart3} label="Registos encontrados" value={data?.filteredSummary?.total ?? 0} tone="teal" /><Metric icon={Target} label="Taxa de conformidade" value={`${data?.filteredSummary?.conformity ?? 0}%`} tone="amber" /><Metric icon={FileWarning} label="Incidências filtradas" value={incidences.length} tone="red" /></div>

    <Card className="border-0 panel-shadow"><CardHeader><CardTitle>Controlos e informações registadas</CardTitle><CardDescription>{selectedFactory} · todos os dados e observações dos controlos abrangidos pelos filtros ativos.</CardDescription></CardHeader><CardContent className="divide-y overflow-hidden rounded-xl border border-slate-100 p-0">{reports.isLoading ? <p className="p-6 text-sm text-muted-foreground">A procurar registos…</p> : entries.length ? entries.map((entry) => <EntryCard key={entry.id} entry={entry} factoryName={factoryName} onDetail={setSelectedEntry} />) : <p className="p-8 text-center text-sm text-muted-foreground">Não existem controlos para os filtros selecionados.</p>}</CardContent></Card>

    <Card className="border-0 panel-shadow"><CardHeader><CardTitle>Incidências no período filtrado</CardTitle><CardDescription>São apresentadas automaticamente a partir dos mesmos filtros aplicados aos controlos. Não necessita de selecionar nova data nem guardar ou exportar separadamente.</CardDescription></CardHeader><CardContent className="divide-y overflow-hidden rounded-xl border border-red-100 p-0">{reports.isLoading ? <p className="p-6 text-sm text-muted-foreground">A procurar incidências…</p> : incidences.length ? incidences.map((entry) => <EntryCard key={entry.id} entry={entry} factoryName={factoryName} onDetail={setSelectedEntry} />) : <p className="p-8 text-center text-sm text-muted-foreground">Não existem incidências para os filtros selecionados.</p>}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><Card className="border-0 panel-shadow"><CardHeader><CardTitle>Conformidade por controlo</CardTitle><CardDescription>Leitura comparativa do conjunto filtrado.</CardDescription></CardHeader><CardContent className="space-y-5">{(data?.modules ?? []).filter((item) => item.total > 0).length ? (data?.modules ?? []).filter((item) => item.total > 0).map((item) => <div key={item.module}><div className="mb-2 flex items-center justify-between gap-3"><div><p className="font-medium">{moduleLabel(item.module)}</p><p className="text-xs text-muted-foreground">{item.total} registos · {item.nc} NC</p></div><span className="font-mono-ui font-semibold">{item.conformity}%</span></div><Progress value={item.conformity} className="h-2" /></div>) : <p className="text-sm text-muted-foreground">Ainda não existem dados suficientes para esta leitura.</p>}</CardContent></Card><Card className="border-0 panel-shadow"><CardHeader><CardTitle>Conformidade por área</CardTitle><CardDescription>Áreas abrangidas pelos filtros ativos.</CardDescription></CardHeader><CardContent className="space-y-3">{data?.areas.length ? data.areas.map((item) => <div key={item.area} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between"><p className="font-medium">{item.area}</p><span className="font-mono-ui text-sm font-semibold text-teal-700">{item.conformity}%</span></div><p className="mt-1 text-sm text-muted-foreground">{item.total} registos</p></div>) : <p className="text-sm text-muted-foreground">Não existem áreas para os filtros ativos.</p>}</CardContent></Card></div>

    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-teal-700" />Evolução no período</CardTitle><CardDescription>Volume de controlos e incidências distribuído pelas datas filtradas.</CardDescription></CardHeader><CardContent><div className="flex h-48 items-end gap-2">{(data?.trends ?? []).map((item) => <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end"><div className="mb-1 text-center font-mono-ui text-[10px] text-red-700">{item.nc} NC</div><div className="relative rounded-t bg-teal-100" style={{ height: `${Math.max((item.entries / maxTrend) * 100, item.entries ? 8 : 2)}%` }}><div className="absolute inset-x-0 bottom-0 rounded-t bg-red-500/80" style={{ height: `${item.entries ? (item.nc / item.entries) * 100 : 0}%` }} /></div><p className="mt-2 text-center font-mono-ui text-[10px] text-muted-foreground">{item.label}</p></div>)}</div></CardContent></Card>

    <Dialog open={Boolean(selectedEntry)} onOpenChange={(open) => !open && setSelectedEntry(null)}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{selectedEntry?.title ?? "Detalhe do controlo"}</DialogTitle><DialogDescription>Todos os campos, observações e evidências do registo selecionado.</DialogDescription></DialogHeader>{selectedEntry ? <div className="space-y-5"><div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Controlo</p><p className="mt-1 font-medium">{moduleLabel(selectedEntry.module)}</p></div><div><p className="text-xs text-muted-foreground">Resultado</p><div className="mt-1"><ResultBadge value={selectedEntry.result} /></div></div><div><p className="text-xs text-muted-foreground">Área</p><p className="mt-1 font-medium">{selectedEntry.area}</p></div><div><p className="text-xs text-muted-foreground">Concluído em</p><p className="mt-1 font-medium">{dateFormat(selectedEntry.completedAt)}</p></div></div><OperatorAttribution name={selectedEntry.registeredByName} title={selectedEntry.registeredByTitle} /><div><p className="mb-2 text-sm font-semibold">Dados registados</p><DetailList payload={selectedEntry.payload} /></div><div><p className="text-sm font-semibold">Observações</p><p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 p-3 text-sm text-slate-800">{selectedEntry.notes?.trim() || "Sem observações registadas."}</p></div></div> : null}</DialogContent></Dialog>
  </section></div>;
}
