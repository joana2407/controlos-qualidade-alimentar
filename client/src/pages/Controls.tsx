import { Button } from "@/components/ui/button";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { ResultBadge, StatusBadge } from "@/components/quality/QualityUi";
import { OperatorAttribution } from "@/components/quality/OperatorAttribution";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateFormat, moduleLabel, MODULES } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { Boxes, Check, ChevronRight, ClipboardPlus, FlaskConical, Gauge, HeartPulse, ListChecks, ListTodo, MessageSquareText, ShieldCheck, X } from "lucide-react";
import React, { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const icons = { bphf: ShieldCheck, metal_detectors: Gauge, sensory: FlaskConical, shelf_life: HeartPulse, monthly_checklist: ListChecks, suggestion_boxes: MessageSquareText, fragile_items: Boxes } as const;

export default function Controls() {
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<string>("bphf");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("Embalagem T");
  const [responsible, setResponsible] = useState("");
  const [dueAt, setDueAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [factoryId, setFactoryId] = useState("");
  const [taskFactoryFilter, setTaskFactoryFilter] = useState("");
  const meta = trpc.quality.metadata.useQuery();
  const taskFilterInput = useMemo(() => taskFactoryFilter ? { factoryId: Number(taskFactoryFilter) } : undefined, [taskFactoryFilter]);
  const tasks = trpc.quality.listTasks.useQuery(taskFilterInput);
  const utils = trpc.useUtils();
  const { canManage } = useQualityAccess();
  const createTask = trpc.quality.createTask.useMutation({ onSuccess: () => { utils.quality.dashboard.invalidate(); utils.quality.listTasks.invalidate(); setOpen(false); setTitle(""); toast.success("Tarefa criada na agenda."); }, onError: (error) => toast.error(error.message) });
  const completeTask = trpc.quality.completeTask.useMutation({ onSuccess: () => { utils.quality.dashboard.invalidate(); utils.quality.listTasks.invalidate(); utils.quality.listNcs.invalidate(); utils.quality.reports.invalidate(); toast.success("Tarefa concluída."); }, onError: (error) => toast.error(error.message) });

  const availableAreas = (meta.data?.areas ?? []).filter((item) => !factoryId || !item.factoryId || item.factoryId === Number(factoryId));
  function submit(event: FormEvent) { event.preventDefault(); if (!factoryId) return toast.error("Selecione a fábrica ou linha para a tarefa."); createTask.mutate({ module: module as any, title, area, factoryId: Number(factoryId), responsible, dueAt: new Date(`${dueAt}T08:00:00`) }); }
  const factoryName = (id: number | null) => meta.data?.factories.find((factory) => factory.id === id)?.name ?? "Sem fábrica";

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Execução de controlos</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Controlos</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Selecione um módulo para iniciar um registo de controlo ou crie uma tarefa para organizar o trabalho da equipa.</p></div>
      {canManage && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><ClipboardPlus className="mr-2 h-4 w-4" />Nova tarefa</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Criar tarefa pontual</DialogTitle><DialogDescription>Defina a fábrica ou linha e o dia de execução. A tarefa ficará visível no painel «Hoje» até ser concluída.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Módulo</Label><Select value={module} onValueChange={setModule}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODULES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Fábrica / linha</Label><Select value={factoryId} onValueChange={(value) => { setFactoryId(value); setArea(""); }}><SelectTrigger><SelectValue placeholder="Selecione a fábrica" /></SelectTrigger><SelectContent>{(meta.data?.factories ?? []).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Área</Label><Select value={area} onValueChange={setArea}><SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger><SelectContent>{availableAreas.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label>Título da tarefa</Label><Input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Verificação diária de higiene" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Responsável</Label><Input required value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Nome do responsável" /></div><div className="space-y-2"><Label>Dia da tarefa</Label><Input required type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div></div><Button className="w-full" disabled={createTask.isPending || !area}>{createTask.isPending ? "A criar…" : "Criar tarefa"}</Button></form></DialogContent></Dialog>}
    </header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{MODULES.map((item) => { const Icon = icons[item.id]; return <Link href={`/controlos/${item.id}`} key={item.id}><Card className="group h-full cursor-pointer border-0 panel-shadow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"><CardHeader><div className="flex items-start justify-between"><div className="rounded-xl bg-slate-100 p-3 text-slate-700 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700"><Icon className="h-5 w-5" /></div><ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-teal-700" /></div><CardTitle className="mt-5 text-lg">{item.label}</CardTitle><CardDescription className="leading-6">{item.description}</CardDescription></CardHeader><CardContent><span className="font-mono-ui text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Abrir módulo</span></CardContent></Card></Link>; })}</div>
    <Card className="border-0 panel-shadow"><CardHeader className="flex flex-col gap-4 border-b border-slate-100 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-teal-700" />Tarefas agendadas</CardTitle><CardDescription>Conclua as tarefas da equipa como conforme ou não conforme.</CardDescription></div><Select value={taskFactoryFilter || "all"} onValueChange={(value) => setTaskFactoryFilter(value === "all" ? "" : value)}><SelectTrigger className="w-full md:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{(meta.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></CardHeader><CardContent className="divide-y divide-slate-100 p-0">{tasks.data?.length ? tasks.data.map((task) => <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between" key={task.id}><div><p className="font-medium">{task.title}</p><p className="mt-1 text-sm text-muted-foreground">{factoryName(task.factoryId)} · {moduleLabel(task.module)} · {task.area} · {task.responsible} · {dateFormat(task.dueAt)}</p>{task.completedByName && <OperatorAttribution verb="Concluído por" name={task.completedByName} title={task.completedByTitle} />}</div><div className="flex flex-wrap items-center gap-2">{task.status === "completed" ? <StatusBadge value={task.status} /> : <><Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={completeTask.isPending} onClick={() => completeTask.mutate({ id: task.id, result: "C" })}><Check className="mr-1 h-4 w-4" />C</Button><Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={completeTask.isPending} onClick={() => completeTask.mutate({ id: task.id, result: "NC", notes: "NC registada a partir da tarefa agendada." })}><X className="mr-1 h-4 w-4" />NC</Button></>}</div></div>) : <div className="p-8 text-center text-sm text-muted-foreground">Ainda não existem tarefas agendadas.</div>}</CardContent></Card>
  </section></div>;
}
