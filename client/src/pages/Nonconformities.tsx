import { SeverityBadge, StatusBadge } from "@/components/quality/QualityUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateFormat, moduleLabel } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Factory, FileWarning, Plus, ShieldAlert } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type OccurrenceType = "incidence" | "nonconformity";

export default function Nonconformities() {
  const utils = trpc.useUtils();
  const [factoryId, setFactoryId] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceIncidenceId, setSourceIncidenceId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [severity, setSeverity] = useState<"critical" | "high" | "medium" | "low">("medium");
  const factoryQuery = useMemo(() => factoryId ? { factoryId: Number(factoryId) } : undefined, [factoryId]);
  const metadata = trpc.quality.metadata.useQuery();
  const incidences = trpc.quality.listIncidences.useQuery(factoryQuery);
  const ncs = trpc.quality.listNcs.useQuery(factoryQuery);
  const createNc = trpc.quality.createNonconformity.useMutation({
    onSuccess: () => {
      utils.quality.listNcs.invalidate();
      utils.quality.listIncidences.invalidate();
      utils.quality.dailyIncidences.invalidate();
      utils.quality.dailyIncidenceSummary.invalidate();
      setCreateOpen(false);
      setSourceIncidenceId("");
      toast.success("Não Conformidade registada e ligada à incidência.");
    },
    onError: (error) => toast.error(error.message),
  });

  const factoryName = (id: number | null | undefined) => metadata.data?.factories.find((factory) => factory.id === id)?.name ?? "Sem fábrica/linha";
  const occurrences = useMemo(() => [
    ...(incidences.data ?? []).map((item) => ({ key: `i-${item.id}`, type: "incidence" as OccurrenceType, id: item.id, title: item.title, description: item.notes ?? "Sem observações.", area: item.area, factoryId: item.factoryId, module: item.module, date: item.completedAt, severity: null, status: item.generatedNonconformity ? "linked" : "open", linked: item.generatedNonconformity, nonconformityId: item.nonconformityId })),
    ...(ncs.data ?? []).map((item) => ({ key: `n-${item.id}`, type: "nonconformity" as OccurrenceType, id: item.id, title: item.title, description: item.description, area: item.area, factoryId: item.factoryId, module: item.module, date: item.detectedAt, severity: item.severity, status: item.status, linked: Boolean(item.sourceEntryId), nonconformityId: item.id })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [incidences.data, ncs.data]);
  const selected = occurrences.find((item) => item.key === selectedKey) ?? null;
  const criticalCount = ncs.data?.filter((item) => item.status !== "closed" && item.severity === "critical").length ?? 0;

  function chooseIncidence(value: string) {
    setSourceIncidenceId(value);
    const incidence = incidences.data?.find((item) => String(item.id) === value);
    if (incidence) { setTitle(incidence.title); setDescription(incidence.notes ?? ""); setArea(incidence.area); }
  }
  function openCreateFromIncidence(id?: number) {
    const source = incidences.data?.find((item) => item.id === id);
    setSourceIncidenceId(source ? String(source.id) : "");
    setTitle(source?.title ?? ""); setDescription(source?.notes ?? ""); setArea(source?.area ?? ""); setSeverity("medium"); setCreateOpen(true);
  }
  function create(event: FormEvent) {
    event.preventDefault();
    const source = incidences.data?.find((item) => String(item.id) === sourceIncidenceId);
    createNc.mutate({ sourceEntryId: source?.id, module: (source?.module ?? "bphf") as any, title, description, area, factoryId: source?.factoryId ?? (factoryId ? Number(factoryId) : undefined), severity });
  }

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-red-700">Registo e tratamento transversal</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Ocorrências</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe numa única lista as Incidências registadas nos controlos e as Não Conformidades formalmente abertas.</p><div className="mt-4 flex items-center gap-2"><Factory className="h-4 w-4 text-red-700" /><Select value={factoryId || "all"} onValueChange={(value) => { setFactoryId(value === "all" ? "" : value); setSelectedKey(""); }}><SelectTrigger className="w-80"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{(metadata.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div></div><div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800"><ShieldAlert className="mr-2 inline h-4 w-4" />{criticalCount} Não Conformidades críticas abertas</div></header>
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"><Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><CardTitle>Lista de ocorrências</CardTitle><CardDescription>As Incidências podem manter-se como registo operacional ou originar uma Não Conformidade.</CardDescription></CardHeader><CardContent className="max-h-[680px] space-y-3 overflow-auto p-4">{incidences.isLoading || ncs.isLoading ? <p className="text-sm text-muted-foreground">A carregar…</p> : occurrences.length ? occurrences.map((item) => <button onClick={() => setSelectedKey(item.key)} key={item.key} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedKey === item.key ? "border-teal-400 bg-teal-50" : "border-slate-100 bg-white hover:border-slate-300"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{item.title}</p><Badge className={item.type === "incidence" ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-red-100 text-red-900 hover:bg-red-100"}>{item.type === "incidence" ? "Incidência" : "Não Conformidade"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{factoryName(item.factoryId)} · {moduleLabel(item.module)} · {item.area}</p></div>{item.severity ? <SeverityBadge value={item.severity as any} /> : <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />}</div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{dateFormat(item.date)}</span>{item.type === "incidence" && <span>{item.linked ? "· NC associada" : "· Sem NC associada"}</span>}{item.type === "nonconformity" && <StatusBadge value={item.status as any} />}</div></button>) : <div className="rounded-xl bg-emerald-50 p-8 text-center text-sm text-emerald-800"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />Sem ocorrências registadas.</div>}</CardContent></Card>
      <Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><CardTitle>{selected ? selected.type === "incidence" ? "Detalhe da incidência" : "Detalhe da Não Conformidade" : "Selecione uma ocorrência"}</CardTitle><CardDescription>{selected ? "Consulte o registo e decida se a incidência deve originar uma Não Conformidade formal." : "A lista reúne ambos os tipos de registo."}</CardDescription></CardHeader><CardContent className="p-5">{selected ? <div className="space-y-5"><div className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><Badge className={selected.type === "incidence" ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-red-100 text-red-900 hover:bg-red-100"}>{selected.type === "incidence" ? "Incidência" : "Não Conformidade"}</Badge>{selected.severity && <SeverityBadge value={selected.severity as any} />}</div><p className="mt-3 text-sm leading-6 text-slate-700">{selected.description}</p><p className="mt-3 text-xs text-muted-foreground">{factoryName(selected.factoryId)} · {selected.area} · {dateFormat(selected.date)}</p></div>{selected.type === "incidence" ? <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50 p-4"><p className="font-medium text-amber-950">Decisão sobre a incidência</p><p className="text-sm text-amber-900">Esta incidência fica registada independentemente de abrir, ou não, uma Não Conformidade.</p>{selected.linked ? <div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />Já originou a Não Conformidade #{selected.nonconformityId}.</div> : <Button onClick={() => openCreateFromIncidence(selected.id)}><Plus className="mr-2 h-4 w-4" />Gerar Não Conformidade</Button>}</div> : <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900"><p className="font-medium">Registo formal de Não Conformidade</p><p className="mt-1">O tratamento, ações corretivas, evidências e validação de eficácia continuam associados a este registo.</p></div>}</div> : <div className="flex min-h-80 flex-col items-center justify-center text-center text-muted-foreground"><FileWarning className="mb-3 h-8 w-8" /><p className="font-medium">Selecione uma ocorrência</p><p className="mt-1 text-sm">Aqui poderá consultar se é uma Incidência ou uma Não Conformidade.</p></div>}</CardContent></Card></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Gerar Não Conformidade</DialogTitle><DialogDescription>Esta ação abre uma Não Conformidade formal a partir da incidência selecionada. Se não a abrir, a incidência mantém-se apenas como incidência.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4"><div className="space-y-2"><Label>Incidência de origem</Label><Select value={sourceIncidenceId} onValueChange={chooseIncidence}><SelectTrigger><SelectValue placeholder="Selecione a incidência" /></SelectTrigger><SelectContent>{(incidences.data ?? []).filter((item) => !item.generatedNonconformity).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Título</Label><Input required value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label>Descrição</Label><Textarea required value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Área</Label><Input required value={area} onChange={(event) => setArea(event.target.value)} /></div><div className="space-y-2"><Label>Gravidade</Label><Select value={severity} onValueChange={(value) => setSeverity(value as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem></SelectContent></Select></div></div><Button className="w-full" disabled={createNc.isPending || !sourceIncidenceId}>{createNc.isPending ? "A registar…" : "Registar Não Conformidade"}</Button></form></DialogContent></Dialog>
  </section></div>;
}
