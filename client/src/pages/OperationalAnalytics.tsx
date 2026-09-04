import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { moduleLabel } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Period = "day" | "week" | "month" | "custom";

const PERIODS: Array<{ id: Exclude<Period, "custom">; label: string; shortLabel: string }> = [
  { id: "day", label: "Dia", shortLabel: "Diário" },
  { id: "week", label: "Semana", shortLabel: "Semanal" },
  { id: "month", label: "Mês", shortLabel: "Mensal" },
];

const COLORS = {
  teal: "#0f766e",
  tealSoft: "#99f6e4",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#dc2626",
  rose: "#e11d48",
  blue: "#2563eb",
  slate: "#64748b",
  slateLight: "#cbd5e1",
} as const;

function localDateKey(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function localDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function rangeForPeriod(period: Exclude<Period, "custom">, referenceDate: string) {
  const start = localDateFromKey(referenceDate);
  const end = new Date(start);
  if (period === "week") {
    const weekDay = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekDay);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  return { startDate: localDateKey(start), endDate: localDateKey(end) };
}

function isoWeekNumber(dateKey: string) {
  const date = localDateFromKey(dateKey);
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function analysisPeriodLabel(period: Period, startDate: string, endDate: string) {
  const start = localDateFromKey(startDate);
  const end = localDateFromKey(endDate);
  if (period === "day" && startDate === endDate) {
    return `Dia ${start.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}`;
  }
  if (period === "week") {
    return `Semana ISO ${isoWeekNumber(startDate)} · ${start.getFullYear()}`;
  }
  if (period === "month") {
    return start.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }
  return "Intervalo personalizado";
}

function formatDateRange(start?: Date | string, end?: Date | string) {
  if (!start || !end) return "Período selecionado";
  const startDate = new Date(start);
  const inclusiveEnd = new Date(new Date(end).getTime() - 1);
  const format = (date: Date) =>
    date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return `${format(startDate)} – ${format(inclusiveEnd)}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    in_progress: "Em tratamento",
    completed: "Tratada",
    no_nc: "Tratada sem NC",
    nc_generated: "NC gerada",
    open: "Aberta",
    awaiting_validation: "A aguardar validação",
    closed: "Fechada",
    critical: "Crítica",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  };
  return labels[status] ?? status;
}

function MetricCard({
  label,
  value,
  help,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  help: string;
  icon: typeof Target;
  tone?: "teal" | "amber" | "red" | "blue";
}) {
  const toneClasses = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  }[tone];
  return (
    <Card className="border-0 panel-shadow">
      <CardContent className="flex items-start gap-3 p-5">
        <span className={`rounded-xl p-2.5 ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-mono-ui mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </div>
  );
}

function DonutLegend({
  items,
  valueKey = "total",
}: {
  items: Array<Record<string, unknown>>;
  valueKey?: string;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
      {items.map((item, index) => (
        <div className="flex items-center gap-2" key={`${String(item.label)}-${index}`}>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: String(item.color) }}
          />
          <span className="truncate text-muted-foreground">{String(item.label)}</span>
          <strong className="ml-auto text-slate-800">{Number(item[valueKey] ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function OperationalAnalytics() {
  const [period, setPeriod] = useState<Period>("day");
  const [referenceDate, setReferenceDate] = useState(() => localDateKey());
  const [startDate, setStartDate] = useState(() => localDateKey());
  const [endDate, setEndDate] = useState(() => localDateKey());
  const applyPeriod = (nextPeriod: Exclude<Period, "custom">, nextReferenceDate = referenceDate) => {
    const range = rangeForPeriod(nextPeriod, nextReferenceDate);
    setPeriod(nextPeriod);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };
  const updateReferenceDate = (nextReferenceDate: string) => {
    setReferenceDate(nextReferenceDate);
    if (period !== "custom") applyPeriod(period, nextReferenceDate);
  };
  const updateStartDate = (nextStartDate: string) => {
    setPeriod("custom");
    setStartDate(nextStartDate);
    if (nextStartDate > endDate) setEndDate(nextStartDate);
  };
  const updateEndDate = (nextEndDate: string) => {
    setPeriod("custom");
    setEndDate(nextEndDate < startDate ? startDate : nextEndDate);
  };
  const queryInput = useMemo(
    () => ({
      period,
      referenceDate: localDateFromKey(referenceDate),
      startDate: localDateFromKey(startDate),
      endDate: localDateFromKey(endDate),
    }),
    [period, referenceDate, startDate, endDate]
  );
  const analytics = trpc.quality.operationalAnalytics.useQuery(queryInput);
  const data = analytics.data as any;
  const periodLabel = PERIODS.find(item => item.id === period)?.shortLabel ?? "Personalizado";
  const selectedPeriodLabel = analysisPeriodLabel(period, startDate, endDate);
  const completion = data?.completion;
  const completionDonut = completion
    ? [
        { label: "Concluídos", total: completion.completed, color: COLORS.emerald },
        { label: "Por concluir", total: completion.pending, color: COLORS.amber },
      ]
    : [];
  const treatmentData = (data?.incidences.byTreatment ?? []).map((item: any) => ({
    ...item,
    label: statusLabel(item.status),
    color:
      item.status === "completed"
        ? COLORS.emerald
        : item.status === "in_progress"
          ? COLORS.blue
          : COLORS.amber,
  }));
  const activityByFactory = (data?.completionByFactory ?? []).map((item: any) => ({
    ...item,
    shortLabel: item.label.replace("Fábrica ", "F"),
  }));
  const activityByControl = (data?.completionByControl ?? []).map((item: any) => ({
    ...item,
    label: moduleLabel(item.module),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-950 via-teal-800 to-cyan-800 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-teal-300/15 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
              <BarChart3 className="h-4 w-4" />
              Painel analítico
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Visão operacional de qualidade
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-teal-50 sm:text-base">
              Acompanhe a execução do plano, os resultados dos controlos, as incidências e a atividade da equipa no período selecionado.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_12rem_12rem] sm:items-end">
            <div className="rounded-xl bg-white/10 p-1 backdrop-blur-sm" role="group" aria-label="Período de análise">
              {PERIODS.map(item => (
                <Button
                  type="button"
                  key={item.id}
                  variant="ghost"
                  size="sm"
                  aria-pressed={period === item.id}
                  onClick={() => applyPeriod(item.id)}
                  className={`h-9 px-3 text-sm ${period === item.id ? "bg-white text-teal-900 hover:bg-white hover:text-teal-900" : "text-teal-50 hover:bg-white/15 hover:text-white"}`}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <label className="block text-xs font-medium text-teal-100">
              Data de referência
              <div className="relative mt-1.5">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700" />
                <Input
                  aria-label="Data de referência da análise"
                  type="date"
                  value={referenceDate}
                  onChange={event => updateReferenceDate(event.target.value)}
                  className="border-white/70 bg-white pl-9 text-slate-950 shadow-sm"
                />
              </div>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <label className="block text-xs font-medium text-teal-100">
                Data inicial
                <Input aria-label="Data inicial da análise" type="date" value={startDate} onChange={event => updateStartDate(event.target.value)} className="mt-1.5 border-white/70 bg-white text-slate-950 shadow-sm" />
              </label>
              <label className="block text-xs font-medium text-teal-100">
                Data final
                <Input aria-label="Data final da análise" type="date" min={startDate} value={endDate} onChange={event => updateEndDate(event.target.value)} className="mt-1.5 border-white/70 bg-white text-slate-950 shadow-sm" />
              </label>
            </div>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-2 text-sm text-teal-50">
          <Badge className="border border-teal-200/30 bg-white/10 text-teal-50 hover:bg-white/10">{selectedPeriodLabel}</Badge>
          <span>{formatDateRange(localDateFromKey(startDate), new Date(localDateFromKey(endDate).getTime() + 86_400_000))}</span>
        </div>
      </section>

      {analytics.isLoading ? (
        <div className="grid min-h-96 place-items-center rounded-2xl border border-slate-100 bg-white panel-shadow">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
            A preparar os indicadores do período…
          </div>
        </div>
      ) : analytics.error || !data ? (
        <Card className="border-red-200 bg-red-50"><CardContent className="p-6 text-sm text-red-800">Não foi possível carregar o painel analítico. Atualize a página ou tente novamente.</CardContent></Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={ClipboardCheck} tone="teal" label="Execução do plano" value={`${completion.rate}%`} help={`${completion.completed} de ${completion.total} controlos previstos concluídos`} />
            <MetricCard icon={CheckCircle2} tone="blue" label="Conformidade" value={`${data.results.conformity}%`} help={`${data.results.conforming} registos conformes no período`} />
            <MetricCard icon={AlertTriangle} tone="amber" label="Incidências" value={data.incidences.total} help={`${data.incidences.byTreatment.find((item: any) => item.status === "pending")?.total ?? 0} aguardam tratamento`} />
            <MetricCard icon={ShieldAlert} tone="red" label="NC geradas" value={data.incidences.nonconformities.total} help={`${data.incidences.nonconformities.byStatus.find((item: any) => item.status === "open")?.total ?? 0} continuam abertas`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5 text-teal-700" />Conclusão do plano</CardTitle>
                <CardDescription>{periodLabel} · {formatDateRange(data.periodStart, data.periodEnd)}</CardDescription>
              </CardHeader>
              <CardContent>
                {completion.total ? <><div className="h-60"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={completionDonut} dataKey="total" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>{completionDonut.map((item, index) => <Cell key={index} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => [`${value} controlos`, ""]} /></PieChart></ResponsiveContainer></div><div className="-mt-32 pb-14 text-center"><p className="font-mono-ui text-4xl font-semibold text-slate-950">{completion.rate}%</p><p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Concluído</p></div><DonutLegend items={completionDonut} /></> : <ChartEmpty text="Não existem controlos planeados neste período." />}
              </CardContent>
            </Card>

            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-teal-700" />Completitude por fábrica</CardTitle>
                <CardDescription>Percentagem calculada com a regra de completitude de cada controlo planeado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activityByFactory.length ? activityByFactory.map((factory: any) => <div key={factory.factoryId ?? "shared"} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"><div className="flex items-center justify-between gap-4"><p className="font-medium text-slate-900">{factory.label}</p><Badge className={factory.rate === 100 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : factory.rate > 0 ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>{factory.rate}%</Badge></div><Progress value={factory.rate} className="mt-3 h-2" /><p className="mt-2 text-xs text-muted-foreground">{factory.completed} concluído(s) · {factory.pending} por concluir · {factory.total} planeado(s)</p></div>) : <ChartEmpty text="Ainda não há fábricas ou controlos transversais com plano neste período." />}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-blue-700" />Completitude e resultados por controlo</CardTitle>
                <CardDescription>À esquerda, controlos concluídos e por concluir; à direita, registos C, NC e N/A do mesmo controlo.</CardDescription>
              </CardHeader>
              <CardContent>
                {activityByControl.length ? <div className="h-[26rem]"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityByControl} layout="vertical" margin={{ top: 4, right: 20, left: 12, bottom: 4 }} barGap={7}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} /><YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11, fill: "#475569" }} /><Tooltip cursor={{ fill: "#f8fafc" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="completed" name="Concluídos" stackId="plan" fill={COLORS.emerald} radius={[0, 4, 4, 0]} /><Bar dataKey="pending" name="Por concluir" stackId="plan" fill={COLORS.amber} radius={[0, 4, 4, 0]} /><Bar dataKey="conforming" name="C" stackId="results" fill={COLORS.teal} radius={[0, 4, 4, 0]} /><Bar dataKey="nonconforming" name="NC" stackId="results" fill={COLORS.red} radius={[0, 4, 4, 0]} /><Bar dataKey="notApplicable" name="N/A" stackId="results" fill={COLORS.slateLight} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Não existem controlos planeados neste período." />}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-700" />Tratamento de incidências</CardTitle>
                <CardDescription>Um desvio de controlo cria uma incidência; durante o tratamento, pode encerrar sem NC ou gerar uma NC.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.incidences.total ? <><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={treatmentData} dataKey="total" nameKey="label" innerRadius={56} outerRadius={84} paddingAngle={3} strokeWidth={0}>{treatmentData.map((item: any, index: number) => <Cell key={index} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => [`${value} incidências`, ""]} /></PieChart></ResponsiveContainer></div><DonutLegend items={treatmentData} /></> : <ChartEmpty text="Não foram registadas incidências no período selecionado." />}
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center"><div><p className="font-mono-ui text-xl font-semibold text-slate-900">{data.incidences.byDecision.find((item: any) => item.status === "pending")?.total ?? 0}</p><p className="mt-1 text-[11px] text-muted-foreground">A decidir</p></div><div><p className="font-mono-ui text-xl font-semibold text-slate-900">{data.incidences.byDecision.find((item: any) => item.status === "no_nc")?.total ?? 0}</p><p className="mt-1 text-[11px] text-muted-foreground">Sem NC</p></div><div><p className="font-mono-ui text-xl font-semibold text-slate-900">{data.incidences.byDecision.find((item: any) => item.status === "nc_generated")?.total ?? 0}</p><p className="mt-1 text-[11px] text-muted-foreground">Com NC</p></div></div>
              </CardContent>
            </Card>

            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><ShieldAlert className="h-5 w-5 text-red-700" />Não conformidades</CardTitle>
                <CardDescription>Apenas as Não Conformidades efetivamente geradas a partir de incidências no período.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">{data.incidences.nonconformities.byStatus.map((item: any) => <div key={item.status} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"><span className="text-sm text-slate-700">{statusLabel(item.status)}</span><strong className="font-mono-ui text-lg text-slate-900">{item.total}</strong></div>)}</div>
                <div className="pt-2"><p className="mb-3 text-sm font-medium text-slate-800">Distribuição por severidade</p>{data.incidences.nonconformities.bySeverity.map((item: any) => <div className="mb-3" key={item.severity}><div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">{statusLabel(item.severity)}</span><strong className="text-slate-800">{item.total}</strong></div><Progress value={data.incidences.nonconformities.total ? (item.total / data.incidences.nonconformities.total) * 100 : 0} className="h-2" /></div>)}</div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-violet-700" />Atividade por técnico</CardTitle>
                <CardDescription>Registos, incidências por desvio e NC efetivamente geradas por responsável.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.activityByTechnician.length ? <div className="h-[20rem]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.activityByTechnician} margin={{ top: 4, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} interval={0} tickFormatter={(value: string) => value.split(" ")[0]} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="total" name="Registos" fill={COLORS.teal} radius={[4, 4, 0, 0]} /><Bar dataKey="incidences" name="Incidências" fill={COLORS.amber} radius={[4, 4, 0, 0]} /><Bar dataKey="generatedNonconformities" name="NC geradas" fill={COLORS.red} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Ainda não há registos associados a técnicos neste período." />}
              </CardContent>
            </Card>
            <Card className="border-0 panel-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-violet-700" />Resumo da equipa</CardTitle>
                <CardDescription>Qualidade, incidências e NC geradas por técnico.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.activityByTechnician.length ? data.activityByTechnician.map((technician: any) => <div key={`${technician.profileId}-${technician.name}`} className="rounded-xl border border-slate-100 p-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{technician.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{technician.title ?? "Técnico de qualidade"}</p></div><Badge className={technician.conformity >= 95 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : technician.conformity > 0 ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>{technician.conformity}% C</Badge></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div><strong className="font-mono-ui block text-base text-slate-900">{technician.total}</strong><span className="text-muted-foreground">Registos</span></div><div><strong className="font-mono-ui block text-base text-emerald-700">{technician.conforming}</strong><span className="text-muted-foreground">C</span></div><div><strong className="font-mono-ui block text-base text-amber-700">{technician.incidences}</strong><span className="text-muted-foreground">Incid.</span></div><div><strong className="font-mono-ui block text-base text-red-700">{technician.generatedNonconformities}</strong><span className="text-muted-foreground">NC geradas</span></div></div></div>) : <ChartEmpty text="Ainda não há atividade de equipa neste período." />}
              </CardContent>
            </Card>
          </section>

          <Card className="border-0 panel-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-blue-700" />Evolução no período</CardTitle>
              <CardDescription>Volume diário de registos, controlos concluídos, incidências e NC geradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.activityTrend.length ? <div className="h-[21rem]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.activityTrend} margin={{ top: 4, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} minTickGap={18} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="registrations" name="Registos" fill={COLORS.blue} radius={[4, 4, 0, 0]} /><Bar dataKey="completedTasks" name="Controlos concluídos" fill={COLORS.emerald} radius={[4, 4, 0, 0]} /><Bar dataKey="incidences" name="Incidências" fill={COLORS.amber} radius={[4, 4, 0, 0]} /><Bar dataKey="generatedNonconformities" name="NC geradas" fill={COLORS.red} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Não existem dados de atividade para apresentar no período selecionado." />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
