// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { similarAlerts, recurrenceAlerts, updateIncidence, createFollowUpTask } = vi.hoisted(() => ({
  similarAlerts: [] as Array<{
    title: string;
    module: string;
    factoryId: number | null;
    factoryName: string;
    pointKey?: string | null;
    collaboratorId?: number | null;
    collaboratorName?: string | null;
    total: number;
  }>,
  recurrenceAlerts: [] as Array<{
    collaboratorId: number;
    collaboratorName: string;
    total: number;
    requiresNcAssessment: boolean;
  }>,
  updateIncidence: vi.fn(),
  createFollowUpTask: vi.fn(),
}));

vi.mock("@/components/OfflineIncidencePanel", () => ({
  OfflineIncidencePanel: ({ variant }: { variant?: string }) =>
    variant === "header" ? <button type="button">Nova incidência</button> : null,
}));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true, activeProfile: { id: 3, name: "Joana Pina" } }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listIncidences: { invalidate: vi.fn() }, listTasks: { invalidate: vi.fn() }, listIncidenceFollowUpTasks: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], collaborators: [{ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade" }, { id: 2, name: "Neuza Antunes", title: "Tec. Qualidade" }, { id: 3, name: "Joana Pina", title: "Resp. Qualidade" }] } }) },
      listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 71, name: "Maria Silva" }, { id: 72, name: "João Costa" }] }) },
      listIncidences: { useQuery: () => ({ data: [{ id: 9, title: "Incidência com foto", result: "NC", notes: "Evidência registada.", area: "Produção", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-21T10:00:00"), occurredOn: "2026-08-19", generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: { collaboratorId: 71, collaboratorName: "Maria Silva", criterion: "Higienização das mãos dos manipuladores", product: "Pão de forma", lot: "L-26247", validity: "2026-09-20", reason: "Bolor identificado na amostra.", incidenceTreatment: { status: "completed", correction: "Correção concluída.", responsible: "Joana Pina", completedAt: "2026-08-21" }, incidenceTreatmentHistory: [{ revision: 1, recordedAt: "2026-08-20T10:00:00.000Z", recordedByProfileId: 3, recordedByName: "Joana Pina", recordedByTitle: "Resp. Qualidade", status: "in_progress", correction: "Correção em curso.", responsible: "Neuza Antunes" }, { revision: 2, recordedAt: "2026-08-21T10:30:00.000Z", recordedByProfileId: 3, recordedByName: "Joana Pina", recordedByTitle: "Resp. Qualidade", status: "completed", correction: "Correção concluída.", responsible: "Joana Pina", completedAt: "2026-08-21" }], evidencePhotos: [{ key: "incidences/9/foto.png", url: "/manus-storage/incidences/9/foto.png", fileName: "foto-incidencia.png", mimeType: "image/png" }] } }, { id: 10, title: "Incidência pendente", result: "NC", notes: "Aguardar tratamento.", area: "Embalagem", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-20T10:00:00"), occurredOn: "2026-08-20", generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: { collaboratorName: "Maria Silva" } }] }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      incidenceRecurrenceAlerts: { useQuery: () => ({ data: recurrenceAlerts }) },
      similarIncidenceAlerts: { useQuery: () => ({ data: similarAlerts }) },
      incidenceVerificationHistory: { useQuery: () => ({ data: [
        { id: 9, operationalDate: "2026-08-19", completedAt: new Date("2026-08-19T10:00:00"), result: "NC", title: "Inspeção BPHF", area: "Produção", state: null, containmentAction: "", notes: "Bolor identificado na amostra.", registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", collaboratorName: "Maria Silva", product: "Pão de forma", lot: "L-26247", validity: "2026-09-20", evidencePhotos: [{ key: "history/9.png", url: "/manus-storage/history/9.png", fileName: "histórico-9.png", mimeType: "image/png" }], isSourceVerification: true },
        { id: 8, operationalDate: "2026-08-12", completedAt: new Date("2026-08-12T10:00:00"), result: "C", title: "Inspeção BPHF", area: "Produção", state: null, containmentAction: "", notes: "Verificação conforme.", registeredByName: "Neuza Antunes", registeredByTitle: "Tec. Qualidade", collaboratorName: "Maria Silva", product: "Pão de forma", lot: "L-26230", validity: "2026-09-13", evidencePhotos: [], isSourceVerification: false },
      ], isLoading: false }) },
      updateIncidence: { useMutation: () => ({ mutate: updateIncidence, isPending: false }) },
      listIncidenceFollowUpTasks: { useQuery: () => ({ data: [], isLoading: false }) },
      createIncidenceFollowUpTask: { useMutation: () => ({ mutate: createFollowUpTask, isPending: false }) },
      deleteIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadVerificationEvidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import Nonconformities from "../client/src/pages/Nonconformities";

const renderConcludedIncidences = () => {
  render(<Nonconformities />);
  fireEvent.click(screen.getByRole("button", { name: "Concluídos" }));
};

afterEach(() => { cleanup(); similarAlerts.length = 0; recurrenceAlerts.length = 0; updateIncidence.mockReset(); createFollowUpTask.mockReset(); });

describe("detalhe de incidência com evidências", () => {
  it("apresenta a fotografia anexada depois de selecionar a incidência", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Fotografias de evidência")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Evidência da incidência: foto-incidencia.png" }).getAttribute("src")).toBe("/manus-storage/incidences/9/foto.png");
  });

  it("mostra o tratamento autónomo mesmo antes da decisão sobre NC", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência pendente/i }));

    expect(screen.getByText("Tratamento da incidência")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Iniciar tratamento" })).toBeTruthy();
    expect(screen.getByText("Não foi gerada uma Não Conformidade para esta incidência.")).toBeTruthy();
  });

  it("mostra o histórico do tratamento com data, tipo e responsáveis", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Histórico do tratamento")).toBeTruthy();
    expect(screen.getByText("2 edições")).toBeTruthy();
    expect(screen.getByText("Edição 2")).toBeTruthy();
    expect(screen.getByText("Em tratamento")).toBeTruthy();
    expect(screen.getAllByText(/Responsável pelo tratamento:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Joana Pina").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/21\/08\/2026/i).length).toBeGreaterThan(0);
  });

  it("mostra no detalhe o colaborador e o critério BPHF inspecionados", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Contexto da verificação BPHF")).toBeTruthy();
    expect(screen.getAllByText("Maria Silva").length).toBeGreaterThan(0);
    expect(screen.getByText(/Produção · Higienização das mãos dos manipuladores/i)).toBeTruthy();
  });

  it("mostra os detalhes completos da verificação no resumo da incidência", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Detalhes da verificação e do desvio")).toBeTruthy();
    expect(screen.getByText("Pão de forma")).toBeTruthy();
    expect(screen.getByText("L-26247")).toBeTruthy();
    expect(screen.getByText("2026-09-20")).toBeTruthy();
    expect(screen.getAllByText("Bolor identificado na amostra.").length).toBeGreaterThan(0);
  });

  it("mostra o histórico completo das verificações no mesmo contexto", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Histórico do colaborador e critério verificados")).toBeTruthy();
    expect(screen.getByText("2 verificações")).toBeTruthy();
    expect(screen.getByText("Origem da incidência")).toBeTruthy();
    expect(screen.getAllByText("Produto: Pão de forma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lote: L-26247").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Evidência da verificação: histórico-9.png" })).toBeTruthy();
  });

  it("permite minimizar e reabrir o histórico de verificações", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    fireEvent.click(screen.getByRole("button", { name: "Minimizar histórico" }));
    expect(screen.getByRole("button", { name: "Mostrar histórico" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Origem da incidência")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar histórico" }));
    expect(screen.getByText("Origem da incidência")).toBeTruthy();
  });

  it("permite minimizar e reabrir os detalhes técnicos da incidência", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    const minimize = screen.getByRole("button", { name: "Minimizar detalhes" });
    expect(minimize.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(minimize);
    expect(screen.getByRole("button", { name: "Mostrar detalhes" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Pão de forma")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar detalhes" }));
    expect(screen.getByText("Pão de forma")).toBeTruthy();
  });

  it("mantém os atalhos da origem e da conversa IA junto ao cabeçalho do detalhe", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByRole("button", { name: "Abrir verificação de origem" })).toBeTruthy();
    const aiButton = screen.getByRole("button", { name: "Abrir Assistente IA de Incidências" });
    expect(aiButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(aiButton);
    expect(screen.getByText("Assistente IA de Incidências")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimizar Assistente IA de Incidências" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Minimizar Assistente IA de Incidências" }));
    expect(screen.queryByText("Assistente IA de Incidências")).toBeNull();
  });

  it("permite minimizar os contextos e as tarefas de seguimento sem perder a identificação", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    fireEvent.click(screen.getByRole("button", { name: "Minimizar contexto BPHF" }));
    expect(screen.getByRole("button", { name: "Mostrar contexto BPHF" }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Minimizar tarefas de seguimento" }));
    expect(screen.getByRole("button", { name: "Mostrar tarefas de seguimento" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("permite atribuir ou remover um colaborador responsável através da lista BPHF", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência pendente/i }));
    fireEvent.click(screen.getByRole("button", { name: "Editar incidência" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Colaborador responsável pela incidência" }));
    fireEvent.click(screen.getByRole("option", { name: "Maria Silva" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateIncidence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, collaboratorId: 71 }),
      expect.any(Object)
    );
  });

  it("mostra a data de ocorrência e permite atualizá-la ao editar a incidência", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getAllByText(/Ocorrida em 19\/08\/2026/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Editar incidência" }));
    fireEvent.change(screen.getByLabelText("Data em que a incidência ocorreu"), { target: { value: "2026-08-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateIncidence).toHaveBeenCalledWith(expect.objectContaining({ id: 9, occurredOn: "2026-08-18" }), expect.any(Object));
  });

  it("permite iniciar o tratamento sem gerar uma Não Conformidade", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência pendente/i }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tratamento" }));

    fireEvent.change(screen.getByLabelText("Responsável pelo tratamento"), { target: { value: "Neuza Antunes" } });
    fireEvent.change(screen.getByLabelText("Correção ou tratamento efetuado"), { target: { value: "Reforço imediato da higienização." } });

    expect((screen.getByLabelText("Responsável pelo tratamento") as HTMLInputElement).value).toBe("Neuza Antunes");
    expect((screen.getByLabelText("Correção ou tratamento efetuado") as HTMLTextAreaElement).value).toBe("Reforço imediato da higienização.");
    expect(screen.getByRole("button", { name: "Guardar tratamento" })).toBeTruthy();
  });

  it("mostra por defeito apenas as incidências que requerem acompanhamento", () => {
    render(<Nonconformities />);

    expect(screen.getByRole("button", { name: "Acompanhamento" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Incidência pendente/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Incidência com foto/i })).toBeNull();
  });

  it("permite filtrar apenas as incidências com tratamento pendente", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: "Tratamento pendente" }));

    expect(screen.getByRole("button", { name: "Tratamento pendente" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Incidência pendente/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Incidência com foto/i })).toBeNull();
  });

  it("mostra as incidências fechadas apenas ao selecionar Concluídos", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: "Concluídos" }));

    expect(screen.getByRole("button", { name: /Incidência com foto/i }).textContent).toMatch(/tratamento concluído/i);
    expect(screen.getByRole("button", { name: /Incidência com foto/i }).textContent).toMatch(/decisão de nc: decisão pendente/i);
    expect(screen.getByLabelText("Resumo gráfico dos tratamentos")).toBeTruthy();
    expect(screen.getByRole("img", { name: /0 pendentes, 0 em curso e 1 concluídos/i })).toBeTruthy();
  });

  it("mantém a criação de incidência no cabeçalho e mostra incidências abertas e NC geradas no resumo", () => {
    render(<Nonconformities />);

    expect(screen.getByRole("button", { name: "Nova incidência" })).toBeTruthy();
    expect(screen.getByText("Incidências abertas")).toBeTruthy();
    expect(screen.getByText("NC geradas")).toBeTruthy();
    expect(screen.queryByText("Registo de incidências sem internet")).toBeNull();
  });

  it("mostra apenas o alerta de colaborador com três incidências ativas", () => {
    recurrenceAlerts.push({
      collaboratorId: 71,
      collaboratorName: "Maria Silva",
      total: 3,
      requiresNcAssessment: true,
    });
    render(<Nonconformities />);

    expect(screen.getByText("Avaliação de Não Conformidade recomendada")).toBeTruthy();
    const alert = screen.getByRole("button", { name: "Abrir as 3 incidências ativas de Maria Silva" });
    expect(alert.textContent).toMatch(/Maria Silva · 3 incidências ativas · avaliar NC/i);

    fireEvent.click(alert);
    expect(screen.getByRole("button", { name: "Acompanhamento" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Tratamento global e relações")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guardar classificação e tratamento global/i })).toBeTruthy();
  });

  it("abre o tratamento global quando o registo antigo só tem o nome do colaborador", () => {
    recurrenceAlerts.push({
      collaboratorId: 999,
      collaboratorName: "Maria Silva",
      total: 3,
      requiresNcAssessment: true,
    });
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir as 3 incidências ativas de Maria Silva" }));

    expect(screen.getByText("Tratamento global e relações")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guardar classificação e tratamento global/i })).toBeTruthy();
  });

  it("oferece um filtro próprio para mostrar apenas NC abertas", () => {
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar apenas NC abertas" }));

    expect(screen.getByRole("button", { name: "A mostrar NC abertas" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("normaliza a data de conclusão antes de guardar o tratamento", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência pendente/i }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tratamento" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Estado do tratamento" }));
    fireEvent.click(screen.getByRole("option", { name: "Tratamento concluído" }));
    fireEvent.change(screen.getByLabelText("Responsável pelo tratamento"), { target: { value: "Neuza Antunes" } });
    fireEvent.change(screen.getByLabelText("Correção ou tratamento efetuado"), { target: { value: "Correção aplicada." } });
    fireEvent.change(screen.getByLabelText("Data de conclusão do tratamento"), { target: { value: "2026-08-21" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar tratamento" }));

    expect(updateIncidence).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        treatment: expect.objectContaining({ completedAt: "2026-08-21" }),
      }),
      expect.any(Object)
    );
  });

  it("abre diretamente a lista filtrada pelo grupo indicado no aviso de NC", () => {
    similarAlerts.push({ title: "Colaborador: Maria Silva", module: "bphf", factoryId: 1, factoryName: "Fábrica 1 (Fatiado)", collaboratorId: 71, collaboratorName: "Maria Silva", total: 3 });
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: /abrir as 3 incidências semelhantes/i }));

    expect(screen.getByRole("status").textContent).toMatch(/a visualizar as 3 incidências no mesmo ponto/i);
    expect(screen.getByRole("status").textContent).toMatch(/colaborador inspecionado «Maria Silva»/i);
    expect(screen.getByRole("button", { name: "Limpar acesso direto" })).toBeTruthy();
    expect(screen.getByText("Tratamento global e relações")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guardar classificação e tratamento global/i })).toBeTruthy();
  });

  it("limpa filtros concorrentes e mantém ocultas as incidências concluídas ao abrir um grupo", () => {
    similarAlerts.push({ title: "Colaborador: Maria Silva", module: "bphf", factoryId: 1, factoryName: "Fábrica 1 (Fatiado)", collaboratorId: 71, collaboratorName: "Maria Silva", total: 3 });
    render(<Nonconformities />);

    fireEvent.change(screen.getByLabelText("Pesquisar incidências"), {
      target: { value: "texto que não existe" },
    });
    expect(screen.queryByRole("button", { name: /Incidência com foto/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /abrir as 3 incidências semelhantes/i }));

    expect((screen.getByLabelText("Pesquisar incidências") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Acompanhamento" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /Incidência com foto/i })).toBeNull();
    expect(screen.getAllByText("Incidência pendente").length).toBeGreaterThan(0);
  });

  it("permite abrir a verificação de origem e criar uma tarefa de seguimento para uma técnica", () => {
    renderConcludedIncidences();
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByRole("button", { name: "Abrir verificação de origem" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar tarefa de seguimento" }));
    fireEvent.change(screen.getByLabelText("Data de execução"), { target: { value: "2026-08-24" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Técnica responsável pela tarefa de seguimento" }));
    fireEvent.click(screen.getByRole("option", { name: "Neuza Antunes" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar e atribuir tarefa" }));

    expect(createFollowUpTask).toHaveBeenCalledWith(expect.objectContaining({
      sourceEntryId: 9,
      assigneeProfileIds: [2],
      title: expect.stringMatching(/Seguimento/i),
    }));
  });
});
