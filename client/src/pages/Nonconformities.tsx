import { SeverityBadge, StatusBadge } from "@/components/quality/QualityUi";
import { Badge } from "@/components/ui/badge";
import { OfflineIncidencePanel } from "@/components/OfflineIncidencePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateFormat, moduleLabel } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { AlertCircle, AlertTriangle, CheckCircle2, Factory, FileWarning, Pencil, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQualityAccess } from "@/contexts/QualityAccessContext";

type OccurrenceType = "incidence" | "nonconformity";
const EXTERNAL_NONCONFORMITY_URL = "https://analiseocorrencias.manus.space/login";

type OccurrenceItem = {
  key: string;
  type: OccurrenceType;
  id: number;
  title: string;
  description: string;
  area: string;
  factoryId: number | null;
  module: string;
  date: Date;
  severity: string | null;
  status: string;
  generatedNonconformity: boolean;
  nonconformityId: number | null;
  occurrenceNumber: string | null;
  registeredByName: string | null;
  registeredByTitle: string | null;
};

export default function Nonconformities() {
  const utils = trpc.useUtils();
  const { canManage } = useQualityAccess();
  const [factoryId, setFactoryId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [occurrenceNumberDraft, setOccurrenceNumberDraft] = useState("");
  const [editingIncidence, setEditingIncidence] = useState(false);
  const [incidenceTitleDraft, setIncidenceTitleDraft] = useState("");
  const [incidenceNotesDraft, setIncidenceNotesDraft] = useState("");
  const [confirmDeleteIncidence, setConfirmDeleteIncidence] = useState(false);
  const filters = useMemo(() => ({
    factoryId: factoryId ? Number(factoryId) : undefined,
    startDate: startDate ? new Date(`${startDate}T12:00:00`) : undefined,
    endDate: endDate ? new Date(`${endDate}T12:00:00`) : undefined,
  }), [endDate, factoryId, startDate]);
  const metadata = trpc.quality.metadata.useQuery();
  const incidences = trpc.quality.listIncidences.useQuery(filters);
  const ncs = trpc.quality.listNcs.useQuery(filters);
  const recurrenceAlerts = trpc.quality.incidenceRecurrenceAlerts.useQuery(undefined, { enabled: canManage });
  const similarIncidenceAlerts = trpc.quality.similarIncidenceAlerts.useQuery(undefined, { enabled: canManage });
  const updateIncidence = trpc.quality.updateIncidence.useMutation({
    onSuccess: () => {
      utils.quality.listIncidences.invalidate();
      toast.success("Estado da incidência atualizado.");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteIncidence = trpc.quality.deleteIncidence.useMutation({
    onSuccess: () => { utils.quality.listIncidences.invalidate(); setSelectedKey(""); setConfirmDeleteIncidence(false); toast.success("Incidência eliminada da lista operacional. A rastreabilidade foi preservada."); },
    onError: (error) => toast.error(error.message),
  });

  const factoryName = (id: number | null | undefined) => metadata.data?.factories.find((factory) => factory.id === id)?.name ?? "Sem fábrica/linha";
  const occurrences = useMemo<OccurrenceItem[]>(() => [
    ...(incidences.data ?? []).map((item) => ({
      key: `i-${item.id}`,
      type: "incidence" as const,
      id: item.id,
      title: item.title,
      description: item.notes ?? "Sem observações.",
      area: item.area,
      factoryId: item.factoryId,
      module: item.module,
      date: item.completedAt,
      severity: null,
      status: item.generatedNonconformity ? "linked" : "open",
      generatedNonconformity: item.generatedNonconformity,
      nonconformityId: item.nonconformityId,
      occurrenceNumber: item.occurrenceNumber,
      registeredByName: item.registeredByName,
      registeredByTitle: item.registeredByTitle,
    })),
    ...(ncs.data ?? []).map((item) => ({
      key: `n-${item.id}`,
      type: "nonconformity" as const,
      id: item.id,
      title: item.title,
      description: item.description,
      area: item.area,
      factoryId: item.factoryId,
      module: item.module,
      date: item.detectedAt,
      severity: item.severity,
      status: item.status,
      generatedNonconformity: true,
      nonconformityId: item.id,
      occurrenceNumber: null,
      registeredByName: item.reportedByName,
      registeredByTitle: item.reportedByTitle,
    })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [incidences.data, ncs.data]);
  const selected = occurrences.find((item) => item.key === selectedKey) ?? null;
  const localOpenNcCount = ncs.data?.filter((item) => item.status !== "closed").length ?? 0;
  const generatedExternalOpenNcCount = (incidences.data ?? []).filter((item) => item.generatedNonconformity && !item.nonconformityId).length;
  const openNcCount = localOpenNcCount + generatedExternalOpenNcCount;

  useEffect(() => {
    setOccurrenceNumberDraft(selected?.occurrenceNumber ?? "");
    setIncidenceTitleDraft(selected?.title ?? "");
    setIncidenceNotesDraft(selected?.description ?? "");
    setEditingIncidence(false);
    setConfirmDeleteIncidence(false);
  }, [selected?.key, selected?.occurrenceNumber]);

  const clearDates = () => { setStartDate(""); setEndDate(""); setSelectedKey(""); };
  const updateGeneratedState = (value: "yes" | "no") => {
    if (!selected || selected.type !== "incidence") return;
    const generatedNonconformity = value === "yes";
    updateIncidence.mutate({ id: selected.id, generatedNonconformity, occurrenceNumber: generatedNonconformity ? occurrenceNumberDraft : "" });
  };
  const saveOccurrenceNumber = () => {
    if (!selected || selected.type !== "incidence") return;
    updateIncidence.mutate({ id: selected.id, generatedNonconformity: true, occurrenceNumber: occurrenceNumberDraft });
  };
  const ncStateLabel = (item: OccurrenceItem) => item.generatedNonconformity ? item.occurrenceNumber ? `NC gerada · n.º ${item.occurrenceNumber}` : "NC gerada · n.º por registar" : "Não gerou NC";

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-red-700">Registo e tratamento transversal</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Incidências</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe incidências registadas nos controlos, a decisão sobre a geração de NC e as Não Conformidades formalmente abertas.</p><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="flex items-center gap-2"><Factory className="h-4 w-4 text-red-700" /><Select value={factoryId || "all"} onValueChange={(value) => { setFactoryId(value === "all" ? "" : value); setSelectedKey(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{(metadata.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-1 block text-xs">Data inicial</Label><Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (endDate && event.target.value > endDate) setEndDate(event.target.value); setSelectedKey(""); }} /></div><div><Label className="mb-1 block text-xs">Data final</Label><Input type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); setSelectedKey(""); }} /></div></div><div className="mt-2"><Button variant="ghost" size="sm" onClick={clearDates}>Limpar intervalo de datas</Button></div></div><div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"><ShieldAlert className="mr-2 inline h-4 w-4" />{openNcCount} Não Conformidades abertas</div></header>
    <OfflineIncidencePanel />
    {canManage && recurrenceAlerts.data?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold">Avaliação de Não Conformidade recomendada</p><p className="mt-1 text-sm text-amber-900">Os colaboradores abaixo acumularam pelo menos 3 incidências ainda sem NC gerada nos últimos 6 meses.</p><div className="mt-3 flex flex-wrap gap-2">{recurrenceAlerts.data.map((alert) => <Badge key={alert.collaboratorId} className="bg-amber-200 text-amber-950 hover:bg-amber-200">{alert.collaboratorName} · {alert.total} incidências</Badge>)}</div></div></div></div> : null}
    {canManage && similarIncidenceAlerts.data?.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><div><p className="font-semibold">Abertura de NC obrigatória</p><p className="mt-1 text-sm text-red-900">Foram registadas 3 ou mais incidências NC semelhantes, ainda sem NC associada, nos últimos 6 meses. Abra a Não Conformidade no sistema externo para dar início ao tratamento.</p><div className="mt-3 flex flex-wrap gap-2">{similarIncidenceAlerts.data.map((alert) => <Badge key={`${alert.module}-${alert.factoryId}-${alert.title}`} className="bg-red-100 text-red-950 hover:bg-red-100">{alert.total} × {alert.title} · {alert.factoryName}</Badge>)}</div></div></div></div> : null}
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"><Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><CardTitle>Lista de Incidências</CardTitle><CardDescription>O estado de geração de NC é apresentado em cada incidência, respeitando os filtros selecionados.</CardDescription></CardHeader><CardContent className="max-h-[680px] space-y-3 overflow-auto p-4">{incidences.isLoading || ncs.isLoading ? <p className="text-sm text-muted-foreground">A carregar…</p> : occurrences.length ? occurrences.map((item) => <button onClick={() => setSelectedKey(item.key)} key={item.key} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedKey === item.key ? "border-teal-400 bg-teal-50" : "border-slate-100 bg-white hover:border-slate-300"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{item.title}</p><Badge className={item.type === "incidence" ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-red-100 text-red-900 hover:bg-red-100"}>{item.type === "incidence" ? "Incidência" : "Não Conformidade"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{factoryName(item.factoryId)} · {moduleLabel(item.module)} · {item.area}</p>{item.type === "incidence" ? <><p className={`mt-2 text-xs font-medium ${item.generatedNonconformity ? "text-emerald-700" : "text-slate-600"}`}>{ncStateLabel(item)}</p><p className="mt-2 text-xs text-slate-600">Registada por: <span className="font-medium">{item.registeredByName ?? "Utilizador não identificado"}</span>{item.registeredByTitle ? ` · ${item.registeredByTitle}` : ""}</p></> : null}</div>{item.severity ? <SeverityBadge value={item.severity as any} /> : <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />}</div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{dateFormat(item.date)}</span>{item.type === "nonconformity" && <StatusBadge value={item.status as any} />}</div></button>) : <div className="rounded-xl bg-emerald-50 p-8 text-center text-sm text-emerald-800"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />Sem incidências para os filtros selecionados.</div>}</CardContent></Card>
      <Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><CardTitle>{selected ? selected.type === "incidence" ? "Detalhe da incidência" : "Detalhe da Não Conformidade" : "Selecione uma Incidência"}</CardTitle><CardDescription>{selected ? "Consulte o registo e indique claramente se originou uma Não Conformidade." : "A lista reúne incidências e Não Conformidades no intervalo escolhido."}</CardDescription></CardHeader><CardContent className="p-5">{selected ? <div className="space-y-5"><div className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><Badge className={selected.type === "incidence" ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-red-100 text-red-900 hover:bg-red-100"}>{selected.type === "incidence" ? "Incidência" : "Não Conformidade"}</Badge>{selected.severity && <SeverityBadge value={selected.severity as any} />}</div><p className="mt-3 text-sm leading-6 text-slate-700">{selected.description}</p><p className="mt-3 text-xs text-muted-foreground">{factoryName(selected.factoryId)} · {selected.area} · {dateFormat(selected.date)}</p>{selected.type === "incidence" && <p className="mt-2 text-xs text-slate-600">Aberta por: <span className="font-medium">{selected.registeredByName ?? "Utilizador não identificado"}</span>{selected.registeredByTitle ? ` · ${selected.registeredByTitle}` : ""}</p>}</div>{selected.type === "incidence" ? <><div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50 p-4"><div><p className="font-medium text-amber-950">Decisão sobre a incidência</p><p className="mt-1 text-sm text-amber-900">Indique se esta incidência gerou uma Não Conformidade e, quando aplicável, registe o número de ocorrência atribuído no sistema externo.</p></div>{canManage && <div className="space-y-2"><Label>Esta incidência gerou uma Não Conformidade?</Label><Select value={selected.generatedNonconformity ? "yes" : "no"} onValueChange={(value) => updateGeneratedState(value as "yes" | "no")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">Não gerou NC</SelectItem><SelectItem value="yes">Gerou NC</SelectItem></SelectContent></Select></div>}{selected.generatedNonconformity ? <div className="space-y-3 rounded-lg border border-emerald-200 bg-white/70 p-3"><div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />Não Conformidade gerada{selected.nonconformityId ? ` · registo interno #${selected.nonconformityId}` : ""}</div>{canManage && <div className="space-y-2"><Label>N.º de ocorrência</Label><div className="flex flex-col gap-2 sm:flex-row"><Input value={occurrenceNumberDraft} onChange={(event) => setOccurrenceNumberDraft(event.target.value)} placeholder="Ex.: 2026-014" /><Button type="button" variant="outline" onClick={saveOccurrenceNumber} disabled={updateIncidence.isPending}><Save className="mr-2 h-4 w-4" />Guardar número</Button></div></div>}<Button asChild><a href={EXTERNAL_NONCONFORMITY_URL} target="_blank" rel="noreferrer"><Plus className="mr-2 h-4 w-4" />Abrir gestão de Não Conformidades</a></Button></div> : <div className="rounded-lg border border-slate-200 bg-white/70 p-3 text-sm text-slate-700">Não foi gerada uma Não Conformidade para esta incidência.</div>}</div>{canManage && <div className="space-y-3 rounded-xl border border-slate-200 p-4"><p className="text-sm font-medium text-slate-900">Gestão pela Responsável de Qualidade</p>{editingIncidence ? <div className="space-y-3"><Input value={incidenceTitleDraft} onChange={(event) => setIncidenceTitleDraft(event.target.value)} /><Textarea value={incidenceNotesDraft} onChange={(event) => setIncidenceNotesDraft(event.target.value)} rows={4} /><div className="flex gap-2"><Button type="button" size="sm" onClick={() => updateIncidence.mutate({ id: selected.id, title: incidenceTitleDraft, notes: incidenceNotesDraft }, { onSuccess: () => { utils.quality.listIncidences.invalidate(); setEditingIncidence(false); toast.success("Incidência atualizada."); } })} disabled={updateIncidence.isPending}><Save className="mr-2 h-4 w-4" />Guardar</Button><Button type="button" size="sm" variant="outline" onClick={() => setEditingIncidence(false)}>Cancelar</Button></div></div> : <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setEditingIncidence(true)}><Pencil className="mr-2 h-4 w-4" />Editar incidência</Button>{confirmDeleteIncidence ? <Button type="button" size="sm" variant="destructive" onClick={() => deleteIncidence.mutate({ id: selected.id })} disabled={deleteIncidence.isPending}>{deleteIncidence.isPending ? "A eliminar…" : "Confirmar eliminação"}</Button> : <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => setConfirmDeleteIncidence(true)}><Trash2 className="mr-2 h-4 w-4" />Eliminar incidência</Button>}</div>}</div>}</> : <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900"><p className="font-medium">Registo formal de Não Conformidade</p><p className="mt-1">O tratamento, ações corretivas, evidências e validação de eficácia continuam associados a este registo.</p></div>}</div> : <div className="flex min-h-80 flex-col items-center justify-center text-center text-muted-foreground"><FileWarning className="mb-3 h-8 w-8" /><p className="font-medium">Selecione uma Incidência</p><p className="mt-1 text-sm">Aqui poderá consultar se gerou uma Não Conformidade e registar o respetivo número de ocorrência.</p></div>}</CardContent></Card></div>
  </section></div>;
}
