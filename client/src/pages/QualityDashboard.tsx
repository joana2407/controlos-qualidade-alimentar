import { SeverityBadge, StatusBadge } from "@/components/quality/QualityUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dateFormat, moduleLabel } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, ArrowRight, Boxes, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Factory, FileText, TimerReset } from "lucide-react";
import { Link } from "wouter";
import React, { useMemo, useState } from "react";

const metricCards = [
  { key: "pending", label: "Tarefas pendentes", icon: ClipboardList, tone: "teal" },
  { key: "overdue", label: "Tarefas atrasadas", icon: TimerReset, tone: "amber" },
  { key: "criticalOpen", label: "NC críticas abertas", icon: AlertTriangle, tone: "red" },
  { key: "fragilePending", label: "Quebráveis pendentes", icon: Boxes, tone: "amber" },
  { key: "completedToday", label: "Concluídas hoje", icon: CheckCircle2, tone: "emerald" },
] as const;

export default function QualityDashboard() {
  const [factoryId, setFactoryId] = useState("");
  const metadata = trpc.quality.metadata.useQuery();
  const dashboardInput = useMemo(() => factoryId ? { factoryId: Number(factoryId) } : undefined, [factoryId]);
  const dashboard = trpc.quality.dashboard.useQuery(dashboardInput);
  const data = dashboard.data;
  const taskGroups = data?.taskGroups ?? { today: [], tomorrow: [], thisWeek: [] };
  const dailySummaryInput = useMemo(() => ({ date: data?.operationalDate ?? new Date(), factoryId: factoryId ? Number(factoryId) : undefined }), [data?.operationalDate, factoryId]);
  const dailySummary = trpc.quality.dailyIncidenceSummary.useQuery(dailySummaryInput, { enabled: Boolean(data?.operationalDate) });
  const factoryName = (id: number | null) => metadata.data?.factories.find((factory) => factory.id === id)?.name ?? "Sem fábrica";
  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6">
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-slate-900 px-6 py-6 text-white panel-shadow md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono-ui text-xs uppercase tracking-[0.2em] text-teal-300">Operação diária</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hoje</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">Acompanhe a execução dos controlos, priorize os desvios críticos e mantenha a produção em conformidade.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"><CalendarDays className="h-4 w-4 text-teal-300" />{data?.operationalDate ? dateFormat(data.operationalDate, false) : "A carregar data…"}</div><Factory className="ml-1 h-4 w-4 text-teal-300" /><Select value={factoryId || "all"} onValueChange={(value) => setFactoryId(value === "all" ? "" : value)}><SelectTrigger className="h-9 w-72 border-slate-700 bg-slate-800 text-slate-100"><SelectValue placeholder="Todas as fábricas e linhas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{(metadata.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-right"><p className="text-xs text-slate-400">Execução do dia</p><p className="font-mono-ui text-xl font-semibold text-teal-300">{data?.metrics.dailyExecutionRate ?? 0}%</p></div>
          <Link href="/controlos"><Button className="bg-teal-500 text-slate-950 hover:bg-teal-400">Registar controlo <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          const tone = { teal: "border-teal-200 bg-teal-50 text-teal-700", amber: "border-amber-200 bg-amber-50 text-amber-700", red: "border-red-200 bg-red-50 text-red-700", emerald: "border-emerald-200 bg-emerald-50 text-emerald-700" }[metric.tone];
          const card = <Card className={`border-0 panel-shadow ${metric.key === "fragilePending" ? "transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-teal-300 focus-within:ring-2 focus-within:ring-teal-500" : ""}`}><CardContent className="flex items-center gap-4 p-5"><div className={`rounded-xl border p-3 ${tone}`}><Icon className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">{metric.label}</p>{dashboard.isLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="font-mono-ui mt-1 text-3xl font-semibold">{data?.metrics[metric.key] ?? 0}</p>}{metric.key === "fragilePending" && <p className="mt-1 text-xs font-medium text-teal-700">Abrir painel de controlo →</p>}</div></CardContent></Card>;
          return metric.key === "fragilePending" ? <Link key={metric.key} href="/controlos/fragile_items" aria-label="Abrir painel de controlo de quebráveis pendentes" className="block rounded-xl focus-visible:outline-none">{card}</Link> : <React.Fragment key={metric.key}>{card}</React.Fragment>;
        })}
      </div>

      <Card className="border-0 panel-shadow"><CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">Fecho operacional</p><CardTitle className="mt-1 flex items-center gap-2"><FileText className="h-5 w-5 text-teal-700" />Relatório do dia</CardTitle><p className="mt-1 text-sm text-muted-foreground">Resumo de incidências e decisões registadas para {data?.operationalDate ? dateFormat(data.operationalDate, false) : "o dia operacional"}.</p></div><Link href="/relatorios"><Button variant="outline" size="sm">Abrir relatório <ArrowRight className="ml-1 h-4 w-4" /></Button></Link></CardHeader><CardContent className="grid gap-3 pt-5 sm:grid-cols-3 lg:grid-cols-4"><div className="rounded-xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-medium text-amber-800">Incidências do dia</p><p className="mt-1 font-mono-ui text-2xl font-semibold text-amber-950">{dailySummary.data?.total ?? 0}</p></div><div className="rounded-xl border border-red-100 bg-red-50 p-4"><p className="text-xs font-medium text-red-800">Geraram NC</p><p className="mt-1 font-mono-ui text-2xl font-semibold text-red-950">{dailySummary.data?.withNonconformity ?? 0}</p></div><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-medium text-emerald-800">Sem NC gerada</p><p className="mt-1 font-mono-ui text-2xl font-semibold text-emerald-950">{dailySummary.data?.withoutNonconformity ?? 0}</p></div><div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-medium text-slate-700">Anotação do dia</p><p className="mt-1 line-clamp-3 text-sm text-slate-900">{dailySummary.data?.note || "Sem anotação operacional registada."}</p></div></CardContent></Card>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
        <div className="space-y-6">
          <Card className="border-0 panel-shadow"><CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4"><div><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">Plano do Dia</p><CardTitle className="mt-1">Controlos agendados</CardTitle></div><Link href="/controlos"><Button variant="ghost" size="sm">Ver controlos <ArrowRight className="ml-1 h-4 w-4" /></Button></Link></CardHeader><CardContent className="p-0">{dashboard.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : (data?.plannedControls ?? []).length ? <div className="divide-y divide-slate-100">{(data?.plannedControls ?? []).map((control) => <div key={control.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="mt-1 rounded-lg bg-teal-50 p-2 text-teal-700"><ClipboardList className="h-4 w-4" /></div><div className="min-w-0"><p className="font-medium text-slate-900">{moduleLabel(control.module)}</p><p className="mt-1 text-sm text-muted-foreground">{factoryName(control.factoryId)} · {control.responsible}</p></div></div><StatusBadge value={control.completed ? "completed" : "pending"} /></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Sem controlos agendados</div>}</CardContent></Card>
          <Card className="border-0 panel-shadow"><CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4"><div><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">Agenda da equipa</p><CardTitle className="mt-1">Tarefas agendadas</CardTitle></div><Link href="/controlos"><Button variant="ghost" size="sm">Ver tarefas <ArrowRight className="ml-1 h-4 w-4" /></Button></Link></CardHeader><CardContent className="p-0">{dashboard.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : [taskGroups.today, taskGroups.tomorrow, taskGroups.thisWeek].some((tasks) => tasks.length) ? <div>{([['Hoje', taskGroups.today], ['Amanhã', taskGroups.tomorrow], ['Esta semana', taskGroups.thisWeek]] as const).map(([label, tasks]) => tasks.length ? <div key={label}><div className="border-y border-slate-100 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="divide-y divide-slate-100">{tasks.map((task) => <div key={task.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="mt-1 rounded-lg bg-slate-100 p-2 text-slate-600"><CalendarClock className="h-4 w-4" /></div><div className="min-w-0"><p className="font-medium text-slate-900">{task.title}</p><p className="mt-1 text-sm text-muted-foreground">{factoryName(task.factoryId)} · {task.responsible}</p></div></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{dateFormat(task.dueAt, false)}</span><StatusBadge value={task.status} /></div></div>)}</div></div> : null)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Sem tarefas agendadas</div>}</CardContent></Card>
        </div>

        <Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100 pb-4"><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-red-700">Atenção prioritária</p><CardTitle className="mt-1 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Ocorrências</CardTitle></CardHeader><CardContent className="space-y-3 p-5">{dashboard.isLoading ? <><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></> : data?.criticalNcs.length ? data.criticalNcs.map((nc) => <Link href="/nao-conformidades" key={nc.id}><div className="cursor-pointer rounded-xl border border-red-100 bg-red-50/60 p-4 transition-colors hover:bg-red-50"><div className="flex items-start justify-between gap-2"><p className="font-medium text-red-950">{nc.title}</p><SeverityBadge value={nc.severity} /></div><p className="mt-2 text-sm text-red-800/80">{nc.area} · detetada {dateFormat(nc.detectedAt, false)}</p></div></Link>) : <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800"><CheckCircle2 className="mb-2 h-5 w-5" />Não existem não conformidades críticas abertas.</div>}<Link href="/nao-conformidades"><Button variant="outline" className="w-full">Gerir não conformidades</Button></Link></CardContent></Card>
      </div>

      <Card className="border-0 panel-shadow"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><div className="rounded-xl bg-teal-50 p-3 text-teal-700"><Activity className="h-5 w-5" /></div><div><p className="font-medium">Rotina de equipa recomendada</p><p className="text-sm text-muted-foreground">Comece o turno pelas tarefas pendentes e pelas NC críticas; reveja ações vencidas antes do fecho do dia.</p></div></div><Link href="/relatorios"><Button variant="outline">Consultar indicadores</Button></Link></CardContent></Card>
    </section>
  </div>;
}
