import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { lisbonCalendarDateToUtc, lisbonDateInputValue } from "@shared/lisbon-time";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  Send,
  ShieldAlert,
  Sparkles,
  TimerReset,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type AssistantReply = {
  question: string;
  answer: string;
  nextSteps: string[];
  cautions: string[];
  questions: string[];
};

const MODULES = new Set([
  "bphf",
  "metal_detectors",
  "sensory",
  "shelf_life",
  "monthly_checklist",
  "suggestion_boxes",
  "fragile_items",
  "dispatch_control",
  "internal_analysis",
  "temperature_controls",
  "food_defense",
]);

const focusStatus = {
  history_without_plan: {
    title: "Registos encontrados sem Plano do Dia",
    description:
      "Existem resultados nesta data, mas não há uma tarefa publicada para este módulo. Consulte o histórico; antes de abrir novo preenchimento, confirme ou publique o Plano do Dia aplicável.",
    tone: "border-amber-200 bg-amber-50 text-amber-950",
  },
  not_planned: {
    title: "Sem Plano do Dia nesta data",
    description:
      "O módulo não tem tarefa planeada para a data consultada. Isto não representa, por si só, uma pendência operacional.",
    tone: "border-slate-200 bg-slate-50 text-slate-800",
  },
  completed: {
    title: "Plano concluído na data consultada",
    description:
      "A cobertura prevista para este módulo está concluída. Pode consultar os resultados e, se necessário, rever o plano para uma verificação adicional futura.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  pending: {
    title: "Plano com cobertura ainda em falta",
    description:
      "Há uma tarefa planeada para esta data que ainda não está integralmente concluída. Abra a prioridade abaixo para confirmar a cobertura em falta.",
    tone: "border-red-200 bg-red-50 text-red-950",
  },
} as const;

function dateLabel(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).format(lisbonCalendarDateToUtc(value));
}

function AssistantList({
  title,
  icon: Icon,
  tone,
  empty,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {empty ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          Sem itens a priorizar neste momento.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">{children}</div>
      )}
    </section>
  );
}

export function QualityManagerCopilot() {
  const { canManage, activeProfile } = useQualityAccess();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [replies, setReplies] = useState<AssistantReply[]>([]);
  const [guidanceTopic, setGuidanceTopic] = useState("");
  const [guidance, setGuidance] = useState("");
  const [assistantError, setAssistantError] = useState("");

  const briefingInput = useMemo(() => {
    const moduleMatch = location.match(/^\/controlos\/([^/?]+)/)?.[1];
    const module = moduleMatch && MODULES.has(moduleMatch) ? moduleMatch : undefined;
    const params = new URLSearchParams(window.location.search);
    const dateKey = params.get("plannedDate") ?? params.get("date");
    return {
      module,
      operationalDate:
        dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
          ? lisbonCalendarDateToUtc(dateKey)
          : undefined,
    };
  }, [location, open]);
  const briefingQuery =
    trpc.quality.qualityManagerAiBriefing?.useQuery?.(briefingInput as any, {
      enabled: canManage && open,
      staleTime: 0,
      refetchOnWindowFocus: false,
    }) ?? {
      data: undefined,
      isLoading: false,
      refetch: async () => undefined,
    };
  const guidanceQuery =
    trpc.quality.listIncidenceAiGuidance?.useQuery?.(undefined, {
      enabled: canManage && open,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }) ?? {
      data: [],
      refetch: async () => undefined,
    };
  const assistant =
    trpc.quality.qualityManagerAiAssist?.useMutation?.({
      onSuccess: (response: {
        answer: string;
        nextSteps: string[];
        cautions: string[];
        questions: string[];
      }) => {
        setAssistantError("");
        setReplies(current => [
          ...current,
          {
            question: question.trim(),
            answer: response.answer,
            nextSteps: response.nextSteps,
            cautions: response.cautions,
            questions: response.questions,
          },
        ]);
        setQuestion("");
      },
      onError: (error: { message: string }) => {
        setAssistantError(error.message || "Não foi possível obter uma resposta do Copiloto.");
        toast.error(error.message);
      },
    }) ?? {
      mutate: () => undefined,
      isPending: false,
    };
  const teach =
    trpc.quality.teachIncidenceAi?.useMutation?.({
      onSuccess: async () => {
        setGuidanceTopic("");
        setGuidance("");
        await guidanceQuery.refetch();
        toast.success("Orientação guardada. O copiloto irá considerá-la nas respostas futuras.");
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }) ?? {
      mutate: () => undefined,
      isPending: false,
    };

  if (!canManage) return null;

  const briefing = briefingQuery.data;
  const counts = briefing?.counts ?? {
    overdueControls: 0,
    controlsDueToday: 0,
    incidencesAwaitingDecision: 0,
    followUpsAwaitingReview: 0,
    openFormalNonconformities: 0,
    overdueCorrectiveActions: 0,
    consistencyAlerts: 0,
  };
  const focused = briefing?.focusedModule;
  const focusedState = focused
    ? focusStatus[focused.status as keyof typeof focusStatus]
    : null;
  const isJoana =
    activeProfile?.name.trim().toLocaleLowerCase("pt-PT") === "joana pina";
  const openPriority = (url: string) => {
    setOpen(false);
    setLocation(url);
  };
  const ask = (preset?: string) => {
    const value = (preset ?? question).trim();
    if (value.length < 2) {
      toast.error("Escreva uma pergunta para o copiloto.");
      return;
    }
    setAssistantError("");
    assistant.mutate({
      question: value,
      module: briefingInput.module,
      operationalDate: briefingInput.operationalDate,
      conversation: replies.slice(-6).flatMap(reply => [
        { role: "user" as const, content: reply.question },
        { role: "assistant" as const, content: reply.answer },
      ]),
    } as any);
  };
  const saveGuidance = () => {
    if (!guidanceTopic.trim() || !guidance.trim()) {
      toast.error("Indique o tema e a orientação que pretende ensinar.");
      return;
    }
    teach.mutate({ topic: guidanceTopic.trim(), guidance: guidance.trim() });
  };

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="fixed right-5 bottom-5 z-40 h-12 rounded-full bg-teal-700 px-4 shadow-xl shadow-teal-900/25 hover:bg-teal-800"
        onClick={() => setOpen(true)}
        aria-label="Abrir Copiloto de Qualidade"
      >
        <Bot className="mr-2 h-5 w-5" />
        <span className="hidden sm:inline">Copiloto de Qualidade</span>
        <span className="sm:hidden">Copiloto</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden border-teal-100 bg-slate-50 p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-teal-100 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 pr-12 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/15 text-teal-200">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <SheetTitle className="text-white">Copiloto de Qualidade</SheetTitle>
                <SheetDescription className="mt-1 text-slate-300">
                  Apoio à decisão da Responsável de Qualidade — sem alterar registos.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4 pb-24">
              {briefingQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-22 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : briefing ? (
                <>
                  <section className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                          Visão operacional · {dateLabel(briefing.operationalDate)}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          Comece pelos itens em vermelho; depois reveja os seguimentos e decisões de incidências.
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-teal-100 text-teal-800 hover:bg-teal-100">
                        {guidanceQuery.data?.length ?? 0} regras
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-red-50 p-2.5">
                        <p className="text-lg font-bold text-red-800">{counts.overdueControls}</p>
                        <p className="text-[11px] leading-4 text-red-900">controlos em atraso</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-2.5">
                        <p className="text-lg font-bold text-amber-800">{counts.controlsDueToday}</p>
                        <p className="text-[11px] leading-4 text-amber-900">por realizar hoje</p>
                      </div>
                      <div className="rounded-lg bg-violet-50 p-2.5">
                        <p className="text-lg font-bold text-violet-800">{counts.incidencesAwaitingDecision}</p>
                        <p className="text-[11px] leading-4 text-violet-900">incidências sem decisão</p>
                      </div>
                      <div className="rounded-lg bg-rose-50 p-2.5">
                        <p className="text-lg font-bold text-rose-800">{counts.followUpsAwaitingReview}</p>
                        <p className="text-[11px] leading-4 text-rose-900">seguimentos a rever</p>
                      </div>
                      <div className="rounded-lg bg-sky-50 p-2.5">
                        <p className="text-lg font-bold text-sky-800">{counts.consistencyAlerts}</p>
                        <p className="text-[11px] leading-4 text-sky-900">incoerências a confirmar</p>
                      </div>
                      <div className="rounded-lg bg-orange-50 p-2.5">
                        <p className="text-lg font-bold text-orange-800">{counts.overdueCorrectiveActions}</p>
                        <p className="text-[11px] leading-4 text-orange-900">ações corretivas em atraso</p>
                      </div>
                    </div>
                  </section>

                  {focused && focusedState ? (
                    <section className={`rounded-xl border p-3 ${focusedState.tone}`}>
                      <div className="flex items-start gap-2">
                        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-semibold">{focused.label} · {dateLabel(focused.operationalDate)}</p>
                          <p className="mt-1 text-xs leading-5">{focusedState.description}</p>
                          <p className="mt-2 text-xs font-medium">
                            {focused.registrations} registo(s) · {focused.completedPlannedTasks}/{focused.plannedTasks} tarefa(s) planeada(s) concluída(s)
                          </p>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <div className="space-y-3">
                    <AssistantList
                      title="Controlos em atraso"
                      icon={AlertTriangle}
                      tone="bg-red-100 text-red-700"
                      empty={!briefing.priorities.overdueTasks.length}
                    >
                      {briefing.priorities.overdueTasks.map((task: any) => (
                        <button
                          type="button"
                          key={task.id}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-red-50"
                          onClick={() => openPriority(task.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{task.moduleLabel}</span>
                            <span className="block truncate text-xs text-slate-600">{task.factoryName} · previsto {dateLabel(task.dueDate)}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-red-700" />
                        </button>
                      ))}
                    </AssistantList>
                    <AssistantList
                      title="Prioridades de hoje"
                      icon={CalendarClock}
                      tone="bg-amber-100 text-amber-700"
                      empty={!briefing.priorities.todayTasks.length}
                    >
                      {briefing.priorities.todayTasks.map((task: any) => (
                        <button
                          type="button"
                          key={task.id}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-amber-50"
                          onClick={() => openPriority(task.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{task.moduleLabel}</span>
                            <span className="block truncate text-xs text-slate-600">{task.factoryName} · {task.responsible}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-700" />
                        </button>
                      ))}
                    </AssistantList>
                    <AssistantList
                      title="Decisões de incidências"
                      icon={FileWarning}
                      tone="bg-violet-100 text-violet-700"
                      empty={!briefing.priorities.pendingTreatment.length}
                    >
                      {briefing.priorities.pendingTreatment.map((incidence: any) => (
                        <button
                          type="button"
                          key={incidence.id}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-violet-50"
                          onClick={() => openPriority(incidence.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{incidence.title}</span>
                            <span className="block truncate text-xs text-slate-600">{incidence.moduleLabel} · {incidence.factoryName}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-700" />
                        </button>
                      ))}
                    </AssistantList>
                    <AssistantList
                      title="Incoerências a confirmar"
                      icon={ClipboardList}
                      tone="bg-sky-100 text-sky-700"
                      empty={!briefing.priorities.consistencyAlerts.length}
                    >
                      {briefing.priorities.consistencyAlerts.map((alert: any) => (
                        <button
                          type="button"
                          key={`${alert.kind}-${alert.id}`}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-sky-50"
                          onClick={() => openPriority(alert.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{alert.moduleLabel} · {alert.factoryName}</span>
                            <span className="block text-xs leading-5 text-slate-600">{alert.message}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-sky-700" />
                        </button>
                      ))}
                    </AssistantList>
                    <AssistantList
                      title="Seguimentos a rever"
                      icon={TimerReset}
                      tone="bg-rose-100 text-rose-700"
                      empty={!briefing.priorities.reviewFollowUps.length}
                    >
                      {briefing.priorities.reviewFollowUps.map((incidence: any) => (
                        <button
                          type="button"
                          key={incidence.id}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-rose-50"
                          onClick={() => openPriority(incidence.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{incidence.title}</span>
                            <span className="block text-xs text-slate-600">{incidence.reviewCount} seguimento(s) concluído(s) a rever</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-rose-700" />
                        </button>
                      ))}
                    </AssistantList>
                    <AssistantList
                      title="Ações corretivas em atraso"
                      icon={ShieldAlert}
                      tone="bg-orange-100 text-orange-700"
                      empty={!briefing.priorities.overdueActions.length}
                    >
                      {briefing.priorities.overdueActions.map((action: any) => (
                        <button
                          type="button"
                          key={action.id}
                          className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-orange-50"
                          onClick={() => openPriority(action.url)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{action.description}</span>
                            <span className="block truncate text-xs text-slate-600">{action.responsible} · prazo {dateLabel(action.dueDate)}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-orange-700" />
                        </button>
                      ))}
                    </AssistantList>
                  </div>

                  <section className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-teal-700" />
                      <h3 className="text-sm font-semibold text-slate-900">Perguntar ao copiloto</h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Coloque qualquer questão ou dúvida. O copiloto analisa o briefing atual e o histórico desta conversa; recomenda ações, mas não executa nem altera dados.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        "Por onde devo começar hoje?",
                        "Há alguma incoerência a confirmar nesta página?",
                        "Resume as incidências que exigem decisão.",
                      ].map(preset => (
                        <Button
                          type="button"
                          key={preset}
                          variant="outline"
                          size="sm"
                          className="h-auto whitespace-normal border-teal-100 px-2 py-1.5 text-left text-xs text-teal-900 hover:bg-teal-50"
                          onClick={() => ask(preset)}
                          disabled={assistant.isPending}
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      className="mt-3 min-h-20 bg-white"
                      value={question}
                      onChange={event => setQuestion(event.target.value)}
                      placeholder="Ex.: Os resultados desta data estão coerentes com o Plano do Dia?"
                      aria-label="Pergunta ao Copiloto de Qualidade"
                    />
                    <Button
                      type="button"
                      className="mt-2 w-full bg-teal-700 hover:bg-teal-800"
                      onClick={() => ask()}
                      disabled={assistant.isPending}
                    >
                      {assistant.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {assistant.isPending ? "A analisar a questão…" : "Perguntar ao assistente"}
                    </Button>
                    {assistantError ? (
                      <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        <p className="font-semibold">O Copiloto não conseguiu responder.</p>
                        <p className="mt-1 text-xs leading-5">{assistantError}</p>
                        <p className="mt-2 text-xs leading-5">Confirme que a sessão operacional continua ativa e tente novamente. A pergunta permanece no campo para repetir o pedido.</p>
                      </div>
                    ) : null}
                    {replies.map((reply, index) => (
                      <article key={`${reply.question}-${index}`} className="mt-3 rounded-lg border border-teal-100 bg-teal-50/50 p-3 text-sm">
                        <p className="font-medium text-teal-950">{reply.question}</p>
                        <p className="mt-2 whitespace-pre-line leading-6 text-slate-700">{reply.answer}</p>
                        {reply.nextSteps.length ? <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Próximos passos</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">{reply.nextSteps.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
                        {reply.cautions.length ? <div className="mt-3 rounded-md bg-amber-50 p-2"><p className="text-xs font-semibold text-amber-900">A confirmar</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-900">{reply.cautions.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
                        {reply.questions.length ? <div className="mt-3"><p className="text-xs font-semibold text-slate-700">Perguntas úteis</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">{reply.questions.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
                      </article>
                    ))}
                  </section>

                  <Accordion type="single" collapsible className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 shadow-sm">
                    <AccordionItem value="learning">
                      <AccordionTrigger className="py-3 hover:no-underline">
                        <span className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                          <BookOpen className="h-4 w-4" />
                          Aprendizagem supervisionada
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        {isJoana ? (
                          <div>
                            <p className="text-xs leading-5 text-amber-900">
                              Ensine uma preferência operacional. A orientação fica auditável e é considerada pelo copiloto e pelo assistente de Incidências.
                            </p>
                            <input
                              className="mt-3 h-9 w-full rounded-md border border-amber-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                              value={guidanceTopic}
                              onChange={event => setGuidanceTopic(event.target.value)}
                              placeholder="Tema (ex.: prioridades de quebráveis)"
                              aria-label="Tema da orientação do copiloto"
                            />
                            <Textarea
                              className="mt-2 min-h-20 border-amber-200 bg-white"
                              value={guidance}
                              onChange={event => setGuidance(event.target.value)}
                              placeholder="Regra ou preferência operacional a considerar…"
                              aria-label="Orientação para o copiloto"
                            />
                            <Button type="button" variant="outline" className="mt-2 w-full border-amber-300 bg-white text-amber-950 hover:bg-amber-100" onClick={saveGuidance} disabled={teach.isPending}>
                              <Lightbulb className="mr-2 h-4 w-4" />
                              {teach.isPending ? "A guardar…" : "Guardar orientação"}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs leading-5 text-amber-900">
                            As orientações são definidas exclusivamente por Joana Pina, garantindo consistência e rastreabilidade da aprendizagem.
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <p className="flex gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    As decisões, validações, publicações e alterações permanecem sempre sob responsabilidade humana e seguem os fluxos existentes da aplicação.
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">
                  Não foi possível obter o briefing operacional. Feche e volte a abrir o copiloto para tentar novamente.
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
