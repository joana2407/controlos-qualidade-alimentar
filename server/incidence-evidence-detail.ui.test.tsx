// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { similarAlerts, updateIncidence, createFollowUpTask } = vi.hoisted(() => ({
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
      listIncidences: { useQuery: () => ({ data: [{ id: 9, title: "Incidência com foto", notes: "Evidência registada.", area: "Produção", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-21T10:00:00"), occurredOn: "2026-08-19", generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: { collaboratorId: 71, collaboratorName: "Maria Silva", criterion: "Higienização das mãos dos manipuladores", incidenceTreatment: { status: "completed", correction: "Correção concluída.", responsible: "Joana Pina", completedAt: "2026-08-21" }, evidencePhotos: [{ key: "incidences/9/foto.png", url: "/manus-storage/incidences/9/foto.png", fileName: "foto-incidencia.png", mimeType: "image/png" }] } }, { id: 10, title: "Incidência pendente", notes: "Aguardar tratamento.", area: "Embalagem", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-20T10:00:00"), occurredOn: "2026-08-20", generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: {} }] }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      incidenceRecurrenceAlerts: { useQuery: () => ({ data: [] }) },
      similarIncidenceAlerts: { useQuery: () => ({ data: similarAlerts }) },
      updateIncidence: { useMutation: () => ({ mutate: updateIncidence, isPending: false }) },
      listIncidenceFollowUpTasks: { useQuery: () => ({ data: [], isLoading: false }) },
      createIncidenceFollowUpTask: { useMutation: () => ({ mutate: createFollowUpTask, isPending: false }) },
      deleteIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadVerificationEvidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import Nonconformities from "../client/src/pages/Nonconformities";

afterEach(() => { cleanup(); similarAlerts.length = 0; updateIncidence.mockReset(); createFollowUpTask.mockReset(); });

describe("detalhe de incidência com evidências", () => {
  it("apresenta a fotografia anexada depois de selecionar a incidência", () => {
    render(<Nonconformities />);

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

  it("mostra no detalhe o colaborador e o critério BPHF inspecionados", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Contexto da verificação BPHF")).toBeTruthy();
    expect(screen.getByText("Maria Silva")).toBeTruthy();
    expect(screen.getByText(/Produção · Higienização das mãos dos manipuladores/i)).toBeTruthy();
  });

  it("mostra a data de ocorrência e permite atualizá-la ao editar a incidência", () => {
    render(<Nonconformities />);
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

  it("permite filtrar a lista por tratamento pendente", () => {
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("combobox", { name: "Filtrar incidências por estado de tratamento" }));
    fireEvent.click(screen.getByRole("option", { name: "Pendentes" }));

    expect(screen.getByRole("combobox", { name: "Filtrar incidências por estado de tratamento" }).textContent).toMatch(/pendentes/i);
    expect(screen.getByRole("button", { name: /Incidência pendente/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Incidência com foto/i })).toBeNull();
  });

  it("mostra na lista o tratamento concluído e o resumo gráfico coerente", () => {
    render(<Nonconformities />);

    expect(screen.getByRole("button", { name: /Incidência com foto/i }).textContent).toMatch(/tratamento concluído/i);
    expect(screen.getByRole("button", { name: /Incidência com foto/i }).textContent).toMatch(/decisão de nc: decisão pendente/i);
    expect(screen.getByLabelText("Resumo gráfico dos tratamentos")).toBeTruthy();
    expect(screen.getByRole("img", { name: /1 pendentes, 0 em curso e 1 concluídos/i })).toBeTruthy();
  });

  it("mantém a criação de incidência no cabeçalho e mostra incidências abertas e NC geradas no resumo", () => {
    render(<Nonconformities />);

    expect(screen.getByRole("button", { name: "Nova incidência" })).toBeTruthy();
    expect(screen.getByText("Incidências abertas")).toBeTruthy();
    expect(screen.getByText("NC geradas")).toBeTruthy();
    expect(screen.queryByText("Registo de incidências sem internet")).toBeNull();
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
  });

  it("permite abrir a verificação de origem e criar uma tarefa de seguimento para uma técnica", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByRole("button", { name: /Ver \/ editar verificação de origem/i })).toBeTruthy();
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
