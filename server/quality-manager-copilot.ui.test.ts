import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const copilot = readFileSync("client/src/components/quality/QualityManagerCopilot.tsx", "utf8");
const layout = readFileSync("client/src/components/DashboardLayout.tsx", "utf8");
const router = readFileSync("server/routers/quality.ts", "utf8");

describe("Copiloto de Qualidade global", () => {
  it("apresenta prioridades operacionais, atalhos e contexto da data selecionada", () => {
    expect(copilot).toContain("Copiloto de Qualidade");
    expect(copilot).toContain("Controlos em atraso");
    expect(copilot).toContain("Seguimentos pendentes");
    expect(copilot).toContain("Prioridades de hoje");
    expect(copilot).toContain("Decisões de incidências");
    expect(copilot).toContain("Seguimentos a rever");
    expect(copilot).toContain("Ações corretivas em atraso");
    expect(copilot).toContain("Incoerências a confirmar");
    expect(copilot).toContain("history_without_plan");
    expect(copilot).toContain("Registos encontrados sem Plano do Dia");
    expect(copilot).toContain("qualityManagerAiBriefing");
    expect(copilot).toContain("qualityManagerAiAssist");
    expect(copilot).toContain("conversation: replies.slice(-6)");
    expect(copilot).toContain("qualquer questão ou dúvida");
    expect(copilot).toContain("O Copiloto não conseguiu responder.");
    expect(copilot).toContain("A pergunta permanece no campo para repetir o pedido.");
    expect(copilot).toContain("refetchInterval: 30_000");
  });

  it("mantém o copiloto disponível em todo o shell apenas para Responsáveis de Qualidade", () => {
    expect(layout).toContain('import { QualityManagerCopilot }');
    expect(layout).toContain("{canManage && <QualityManagerCopilot />}");
    expect(copilot).toContain("if (!canManage) return null");
  });

  it("protege dados e assistência no servidor com qualityManagerProcedure", () => {
    expect(router).toContain("qualityManagerAiBriefing: qualityManagerProcedure");
    expect(router).toContain("qualityManagerAiAssist: qualityManagerProcedure");
    expect(router).toContain("conversationMessages");
    expect(router).toContain("um assistente de IA integrado para conversar");
    expect(router).toContain("listIncidenceAiGuidance: qualityManagerProcedure");
    expect(router).toContain("buildQualityManagerAiBriefing");
    expect(router).toContain("completed_without_coverage");
    expect(router).toContain("pending_with_coverage");
    expect(router).toContain("reconcilePendingQualityTasks");
    expect(router).toContain("const operationalTasks = activeTasks.filter(task => !task.sourceEntryId)");
    expect(router).toContain("const overdueFollowUpTasks = pendingFollowUpTasks");
    expect(router).toContain("isPendingFollowUpTask");
    expect(router).toContain("isFollowUp: Boolean(task.sourceEntryId)");
    expect(router).toContain("Reconciliação automática supervisionada");
    expect(router).toContain("reconcilia automaticamente tarefas pendentes");
    expect(copilot).toContain("reconcilia automaticamente apenas tarefas pendentes");
    expect(copilot).toContain("incoerência(s) corrigida(s) automaticamente");
  });

  it("preserva a decisão humana e o tratamento externo de NC no prompt operacional", () => {
    expect(router).toContain("não executas alterações");
    expect(router).toContain("não decides uma NC");
    expect(router).toContain("Incidências que já geraram NC são geridas externamente");
    expect(copilot).toContain("não altera verificações, resultados, incidências, NC ou planos");
    expect(copilot).toContain("permanecem sempre sob responsabilidade humana");
  });
});
