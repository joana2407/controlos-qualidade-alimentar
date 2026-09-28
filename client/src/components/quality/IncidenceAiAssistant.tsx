import type { Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { trpc } from "@/lib/trpc";
import { Bot, BookOpen, Lightbulb, MessageSquareText, ShieldAlert, Sparkles } from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const AIChatBox = lazy(() =>
  import("@/components/AIChatBox").then(module => ({ default: module.AIChatBox }))
);

export type IncidenceAiContext = {
  incidenceId: number;
  title: string;
  module: string;
  occurredOn: string;
  factory?: string;
  area?: string;
  description?: string;
  result?: string;
  treatmentStatus?: string;
  generatedNonconformity?: boolean;
  occurrenceNumber?: string;
  collaboratorName?: string;
  pointKey?: string;
  totalNonconformingReportsAtPoint?: number;
  fragileRecurrenceHistory?: Array<{
    operationalDate: string;
    state: string;
    containmentAction?: string;
    notes?: string;
    registeredByName?: string;
  }>;
  details?: Array<{ label: string; value: string }>;
  treatmentHistory?: Array<{
    revision: number;
    status: string;
    correction?: string;
    responsible?: string;
    recordedAt: string;
  }>;
};

type Props = { incidence?: IncidenceAiContext };

const initialMessage: Message = {
  role: "assistant",
  content:
    "Posso ajudar a analisar a incidência selecionada, identificar informação em falta e propor próximos passos. Não altero registos nem decido NC por si.",
};

const formatResponse = (response: {
  answer: string;
  suggestions: string[];
  risks: string[];
  questions: string[];
}) => {
  const sections = [response.answer.trim()];
  if (response.suggestions.length) {
    sections.push(`**Próximos passos sugeridos**\n${response.suggestions.map(item => `- ${item}`).join("\n")}`);
  }
  if (response.risks.length) {
    sections.push(`**Pontos de atenção**\n${response.risks.map(item => `- ${item}`).join("\n")}`);
  }
  if (response.questions.length) {
    sections.push(`**Perguntas para fechar a análise**\n${response.questions.map(item => `- ${item}`).join("\n")}`);
  }
  return sections.join("\n\n");
};

export function IncidenceAiAssistant({ incidence }: Props) {
  const { activeProfile, canManage } = useQualityAccess();
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [topic, setTopic] = useState("");
  const [guidance, setGuidance] = useState("");
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const guidanceQuery = trpc.quality.listIncidenceAiGuidance?.useQuery?.(undefined, {
    enabled: canManage,
  }) ?? {
    data: [],
    refetch: async () => undefined,
  };
  const assist = trpc.quality.incidenceAiAssist?.useMutation?.({
    onSuccess: response => {
      setFailedQuestion(null);
      setMessages(current => [
        ...current,
        { role: "assistant", content: formatResponse(response) },
      ]);
    },
    onError: error => {
      const retryQuestion = messages.at(-1)?.role === "user" ? messages.at(-1)?.content : null;
      setFailedQuestion(retryQuestion ?? "Analisa novamente esta incidência.");
      const message = error.message || "Não foi possível obter a resposta do assistente.";
      setMessages(current => [
        ...current,
        { role: "assistant", content: `**Não foi possível concluir a análise.**\n\n${message}\n\nO contexto da incidência foi preservado. Pode tentar novamente.` },
      ]);
      toast.error(message);
    },
  }) ?? {
    mutate: () => undefined,
    isPending: false,
  };
  const teach = trpc.quality.teachIncidenceAi?.useMutation?.({
    onSuccess: () => {
      void guidanceQuery.refetch();
      setTopic("");
      setGuidance("");
      toast.success("Orientação guardada. O agente irá considerá-la nas próximas respostas.");
    },
    onError: error => toast.error(error.message),
  }) ?? {
    mutate: () => undefined,
    isPending: false,
  };
  const canTeach = canManage && activeProfile?.name.trim().toLocaleLowerCase("pt-PT") === "joana pina";

  const context = useMemo(() => incidence, [incidence]);
  useEffect(() => {
    setMessages([initialMessage]);
  }, [incidence?.title, incidence?.occurredOn, incidence?.module]);

  const sendMessage = (content: string) => {
    const userMessage: Message = { role: "user", content };
    setMessages(current => [...current, userMessage]);
    assist.mutate({ question: content, incidence: context });
  };

  const teachGuidance = () => {
    if (!topic.trim() || !guidance.trim()) {
      toast.error("Indique um tema e a orientação que pretende ensinar ao agente.");
      return;
    }
    teach.mutate({ topic: topic.trim(), guidance: guidance.trim() });
  };

  if (!canManage) return null;

  return (
    <Card className="overflow-hidden border-teal-200 bg-gradient-to-br from-white via-teal-50/40 to-slate-50">
      <CardHeader className="border-b border-teal-100 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle className="text-base">Assistente IA de Incidências</CardTitle>
              <Badge variant="outline" className="border-teal-200 bg-white text-teal-800">
                <Sparkles className="mr-1 h-3 w-3" /> Apoio
              </Badge>
            </div>
            <CardDescription className="mt-2 max-w-3xl">
              Analisa a incidência selecionada, sugere próximos passos e indica informação em falta. As decisões permanecem sempre com a Responsável de Qualidade.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            {guidanceQuery.data?.length ?? 0} orientações aprendidas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <Suspense fallback={<div className="flex h-[390px] items-center justify-center rounded-lg border bg-white text-sm text-slate-500">A preparar o assistente…</div>}>
          <AIChatBox
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={assist.isPending}
            height={"390px"}
            placeholder="Pergunte sobre esta incidência…"
            emptyStateMessage="Peça uma análise, uma lista de próximos passos ou perguntas para completar o registo."
            suggestedPrompts={[
              "Resume o risco e a prioridade desta incidência.",
              "Que informação ou evidência falta para decidir o tratamento?",
              "Sugere os próximos passos, sem alterar o registo.",
            ]}
          />
        </Suspense>
        <div className="space-y-4">
          <div className="rounded-xl border border-teal-100 bg-white/80 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <MessageSquareText className="h-4 w-4 text-teal-700" />
              Contexto usado
            </div>
            <p className="mt-2 leading-6">
              {incidence
                ? `A incidência «${incidence.title}» de ${incidence.occurredOn} está selecionada.`
                : "Nenhuma incidência está selecionada; pode pedir orientação geral."}
            </p>
            {incidence?.generatedNonconformity && (
              <p className="mt-2 flex gap-2 text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Esta incidência já gerou NC e o tratamento é gerido no site externo.
              </p>
            )}
          </div>
          {canTeach ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center gap-2 font-semibold text-amber-950">
                <BookOpen className="h-4 w-4" />
                Ensinar uma orientação
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                As orientações ficam guardadas com a sua autoria e passam a ser consideradas nas respostas futuras.
              </p>
              <Input
                className="mt-3 bg-white"
                value={topic}
                onChange={event => setTopic(event.target.value)}
                placeholder="Tema (ex.: reincidência em quebráveis)"
                aria-label="Tema da orientação"
              />
              <Textarea
                className="mt-2 min-h-24 bg-white"
                value={guidance}
                onChange={event => setGuidance(event.target.value)}
                placeholder="Escreva a regra ou preferência que o agente deve seguir…"
                aria-label="Orientação a ensinar ao agente"
              />
              <Button
                type="button"
                className="mt-2 w-full"
                variant="outline"
                onClick={teachGuidance}
                disabled={teach.isPending}
              >
                <Lightbulb className="mr-2 h-4 w-4" />
                {teach.isPending ? "A guardar…" : "Guardar orientação"}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-xs leading-5 text-slate-600">
              A aprendizagem do agente é gerida exclusivamente pela Responsável de Qualidade Joana Pina. Os restantes perfis podem consultar e usar o assistente.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
