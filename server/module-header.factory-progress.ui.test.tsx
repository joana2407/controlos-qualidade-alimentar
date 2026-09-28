// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = () => undefined;
if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => undefined;
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined;

const dashboardInputs = vi.hoisted(() => [] as unknown[]);
const authorizationInputs = vi.hoisted(() => [] as unknown[]);
const dailyResultsInputs = vi.hoisted(() => [] as unknown[]);
const routeModule = vi.hoisted(() => ({ value: "bphf" }));
const authorizationState = vi.hoisted(() => ({ allowed: true, taskId: 51 as number | null, dueAt: new Date("2026-08-20T12:00:00"), isPreviousPending: true, isFuturePlanned: false, reason: "Autorizado" }));
const uploadEvidenceMutate = vi.hoisted(() => vi.fn());
const createEntryMutateAsync = vi.hoisted(() => vi.fn());
const bphfInspections = vi.hoisted(() => [] as Array<{ id: number; criterion: string; area: string; collaboratorName: string; result: string; completedAt: Date }>);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, fragilePending: { invalidate: vi.fn() }, dailyControlResults: { invalidate: vi.fn() }, listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" }, { id: 2, code: "F2_GRANEL", name: "Fábrica 2 (granel)" }, { id: 3, code: "F3_SEM_GLUTEN", name: "Fábrica 3 (Sem Gluten)" }], areas: [{ id: 1, name: "Produção", group: "bphf", factoryId: 1 }, { id: 4, name: "Embalagem", group: "bphf", factoryId: 1 }, { id: 5, name: "Limpeza", group: "bphf", factoryId: 1 }, { id: 2, name: "Produção", group: "bphf", factoryId: 2 }, { id: 3, name: "Produção", group: "bphf", factoryId: 3 }, { id: 11, name: "Linha 1", group: "metal", factoryId: 1 }, { id: 12, name: "Linha 2", group: "metal", factoryId: 1 }] } }) },
      dashboard: { useQuery: (input: unknown) => { dashboardInputs.push(input); return { isLoading: false, data: { moduleProgress: { bphf: { expected: 3, completed: 1, registeredToday: 1, pending: ["Plano do Dia — bphf"], percentage: 33.3 }, metal_detectors: { expected: 2, completed: 1, registeredToday: 1, pending: ["Plano do Dia — metal_detectors"], percentage: 50 } }, moduleProgressByFactory: { bphf: [{ factoryId: 1, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }, { factoryId: 2, expected: 1, completed: 1, registeredToday: 1, percentage: 100 }, { factoryId: 3, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }], metal_detectors: [{ factoryId: 1, expected: 2, completed: 1, registeredToday: 1, percentage: 50 }] } } }; } },
      dailyControlResults: { useQuery: (input: unknown) => { dailyResultsInputs.push(input); const module = (input as { module?: string }).module; const entries = module === "metal_detectors" ? [{ id: 91, title: "Detetor de metais — Linha 1 · Produto de teste", area: "Linha 1", result: "C", notes: null, payload: {}, completedAt: new Date("2026-08-20T11:30:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] : module === "sensory" ? [{ id: 90, title: "Controlo sensorial — Broa da serra", area: "Controlo sensorial", result: "C", notes: null, payload: { product: "Broa da serra", lot: "L1", validity: "2026-08-28" }, completedAt: new Date("2026-08-20T11:30:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }, { id: 92, title: "Controlo sensorial — Pão integral", area: "Controlo sensorial", result: "NC", notes: "Aspeto a rever.", payload: { product: "Pão integral", lot: "L2", validity: "2026-08-28" }, completedAt: new Date("2026-08-20T12:15:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] : module === "suggestion_boxes" ? [{ id: 93, title: "Caixa de sugestões — Caixa escritório", area: "Caixa escritório", result: "C", notes: "Sem sugestões pendentes.", payload: { count: 0, triage: "Triada" }, completedAt: new Date("2026-08-20T11:30:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] : [{ id: 90, title: "Higienização das mãos dos manipuladores", area: "Produção", result: "C", notes: "Sem desvios observados.", payload: { collaboratorName: "Colaborador de teste" }, completedAt: new Date("2026-08-20T11:30:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }]; return { isLoading: false, data: { entries } }; } },
      temperatureHistory: { useQuery: () => ({ isLoading: false, data: [{ entryId: 201, equipmentId: "f1-freezer-1", name: "Equipamento de congelação 1", area: "Área da Qualidade", temperature: -19, result: "C", notes: "Leitura estável.", completedAt: new Date("2026-08-20T14:35:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] }) },
      pendingControlTasks: { useQuery: () => ({ isLoading: false, data: [{ id: 72, dueAt: new Date("2026-08-18T12:00:00"), responsible: "Ana", factoryId: 1 }] }) },
      controlAuthorization: { useQuery: (input: unknown) => { authorizationInputs.push(input); return { isLoading: false, data: authorizationState }; } },
      listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 1, name: "Colaborador de teste" }] }) },
      listBphfCollaboratorInspections: { useQuery: () => ({ isLoading: false, data: bphfInspections }) },
      addBphfInspectionEmployee: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      createEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: createEntryMutateAsync }) },
      uploadVerificationEvidence: { useMutation: () => ({ isPending: false, mutate: uploadEvidenceMutate }) },
      updateControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      deleteControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
  useRoute: () => [true, { module: routeModule.value }],
  useSearch: () => window.location.search,
  useLocation: () => [window.location.pathname, (target: string) => window.history.pushState({}, "", target)],
}));

import ModuleControl from "../client/src/pages/ModuleControl";

describe("cabeçalho de controlo — progresso por fábrica", () => {
  afterEach(() => { cleanup(); dashboardInputs.length = 0; authorizationInputs.length = 0; dailyResultsInputs.length = 0; bphfInspections.length = 0; uploadEvidenceMutate.mockReset(); createEntryMutateAsync.mockReset(); routeModule.value = "bphf"; delete (authorizationState as any).bphfCriteria; delete (authorizationState as any).metalDetectorLines; Object.assign(authorizationState, { allowed: true, taskId: 51, dueAt: new Date("2026-08-20T12:00:00"), isPreviousPending: true, isFuturePlanned: false, reason: "Autorizado" }); window.history.pushState({}, "", "/"); });

  it("substitui o resumo geral pelos cartões das fábricas incluídas no Plano do Dia", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Preenchimento por fábrica")).toBeTruthy();
    expect(screen.getByText("Fábrica 1 (Fatiado)")).toBeTruthy();
    expect(screen.getByText("Fábrica 2 (granel)")).toBeTruthy();
    expect(screen.getByText("Fábrica 3 (Sem Gluten)")).toBeTruthy();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.queryByText("Preenchimento de hoje")).toBeNull();
  });

  it("destaca a data prevista quando o formulário abre uma pendência de dia anterior", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Controlo retroativo")).toBeTruthy();
    expect(screen.getByText(/Este controlo é relativo ao dia/)).toBeTruthy();
    expect(screen.getAllByText("20/08/2026").length).toBeGreaterThan(0);
    expect(screen.getByText(/e não para o dia atual/)).toBeTruthy();
    const input = dashboardInputs[0] as { date: Date };
    expect(input.date.toISOString()).toContain("2026-08-20T12:00:00.000Z");
  });

  it("permite selecionar a data operacional em todos os painéis e atualiza as consultas da data escolhida", () => {
    window.history.pushState({}, "", "/controlos/sensory?factoryId=1&date=2026-08-18");
    routeModule.value = "sensory";
    render(<ModuleControl />);

    const dateFilter = screen.getByLabelText("Data do controlo") as HTMLInputElement;
    expect(dateFilter.value).toBe("2026-08-18");
    expect(dashboardInputs[0]).toMatchObject({
      date: new Date("2026-08-18T12:00:00"),
    });
    expect(dailyResultsInputs[0]).toMatchObject({
      module: "sensory",
      factoryId: 1,
      operationalDate: new Date("2026-08-18T12:00:00"),
    });

    fireEvent.change(dateFilter, { target: { value: "2026-08-19" } });
    expect(window.location.search).toContain("date=2026-08-19");
    expect(window.location.search).not.toContain("plannedTaskId");
    expect(window.localStorage.getItem("quality-control-operational-date:sensory")).toBe("2026-08-19");
  });

  it("atualiza o formulário para o plannedTaskId e data da pendência após navegar no mesmo controlo", () => {
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1");
    const view = render(<ModuleControl />);
    expect(authorizationInputs[0]).toMatchObject({ module: "bphf", factoryId: 1, plannedTaskId: undefined });

    window.history.pushState({}, "", "/controlos/bphf?factoryId=1&plannedTaskId=72");
    view.rerender(<ModuleControl />);

    expect(authorizationInputs.at(-1)).toMatchObject({ module: "bphf", factoryId: 1, plannedTaskId: 72 });
    expect(screen.getByText("Controlo retroativo")).toBeTruthy();
    expect(screen.getAllByText(/20\/08\/2026/).length).toBeGreaterThan(0);
  });

  it("apresenta abaixo do formulário os resultados registados para a data consultada", () => {
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1");
    render(<ModuleControl />);
    expect(screen.getByText("Data em preenchimento: 20/08/2026")).toBeTruthy();
    expect(screen.getByText("Pendências de dias anteriores")).toBeTruthy();
    expect(screen.getByText("Pendente desde 18/08/2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir pendência/ }).getAttribute("href")).toBe("/controlos/bphf?plannedTaskId=72&factoryId=1");
    expect(screen.getByText("Resultados registados")).toBeTruthy();
    expect(screen.getAllByText("Higienização das mãos dos manipuladores").length).toBeGreaterThan(1);
    expect(screen.getByText(/Colaborador: Colaborador de teste/)).toBeTruthy();
    const input = dailyResultsInputs[0] as { module: string; factoryId: number; operationalDate: Date };
    expect(input).toMatchObject({ module: "bphf", factoryId: 1 });
    expect(input.operationalDate.toISOString()).toContain("2026-08-20T12:00:00.000Z");
  });

  it("mantém cada critério BPHF pendente até o próprio ponto ser verificado", () => {
    const areas = ["Produção", "Embalagem", "Limpeza"];
    ["Estado de limpeza e conservação do fardamento", "Higienização das mãos dos manipuladores", "Cumprimento geral das regras de BPHF"].forEach((criterion, criterionIndex) => areas.forEach((area, areaIndex) => bphfInspections.push({ id: criterionIndex * 10 + areaIndex + 1, criterion, area, collaboratorName: "Colaborador de teste", result: "C", completedAt: new Date("2026-08-28T11:30:00") })));
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getAllByText("Mínimo concluído")).toHaveLength(3);
    expect(screen.getByText("Estado de limpeza e organização dos cacifos do pessoal e de trabalho")).toBeTruthy();
    expect(screen.getByText("3 de 3 área(s) ainda por verificar.")).toBeTruthy();
    expect(screen.getAllByText("Em preenchimento").length).toBeGreaterThan(0);
  });

  it("mostra no formulário apenas os critérios BPHF escolhidos para o Plano do Dia", () => {
    Object.assign(authorizationState as any, { bphfCriteria: ["Higienização das mãos dos manipuladores"] });
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1&plannedTaskId=51");
    render(<ModuleControl />);

    expect(screen.getAllByText("Higienização das mãos dos manipuladores").length).toBeGreaterThan(0);
    expect(screen.queryByText("Estado de limpeza e conservação do fardamento")).toBeNull();
    expect(screen.queryByText("Cumprimento geral das regras de BPHF")).toBeNull();
  });

  it("permite concluir uma área BPHF como N/A sem indicar um colaborador", async () => {
    const user = userEvent.setup();
    Object.assign(authorizationState as any, {
      bphfCriteria: ["Higienização das mãos dos manipuladores"],
      dueAt: new Date("2026-09-03T10:00:00"),
      isPreviousPending: false,
    });
    createEntryMutateAsync.mockResolvedValue({ id: 880 });
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1&plannedTaskId=51");
    render(<ModuleControl />);

    await user.click(
      screen.getByRole("combobox", {
        name: "Área verificada para Higienização das mãos dos manipuladores",
      })
    );
    await user.click(screen.getByRole("option", { name: /Limpeza — pendente/ }));
    await user.click(screen.getByRole("button", { name: "N/A" }));

    const employeeInput = screen.getByRole("combobox", {
      name: "Selecione o colaborador para Higienização das mãos dos manipuladores",
    }) as HTMLInputElement;
    expect(employeeInput.disabled).toBe(true);
    expect(employeeInput.value).toBe("Não aplicável");
    expect(
      screen.getByRole("button", { name: "Registar área verificada" })
    ).toHaveProperty("disabled", false);

    await user.click(
      screen.getByRole("button", { name: "Registar área verificada" })
    );

    await waitFor(() =>
      expect(createEntryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          module: "bphf",
          area: "Limpeza",
          result: "N/A",
          payload: expect.objectContaining({
            collaboratorName: "Não aplicável",
          }),
        })
      )
    );
  });

  it("mostra no formulário de Detetores apenas as linhas escolhidas no Plano do Dia", () => {
    routeModule.value = "metal_detectors";
    Object.assign(authorizationState as any, { metalDetectorLines: ["Linha 1"] });
    window.history.pushState({}, "", "/controlos/metal_detectors?factoryId=1&plannedTaskId=51");
    render(<ModuleControl />);

    expect(screen.getAllByText("Linha 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Linha 2")).toBeNull();
  });

  it("apresenta a Arca de Congelação de Expedição na Fábrica 2 com limite de -18 ºC", () => {
    routeModule.value = "temperature_controls";
    window.history.pushState({}, "", "/controlos/temperature_controls?factoryId=2");
    render(<ModuleControl />);

    expect(screen.getByText("Arca de Congelação expedição")).toBeTruthy();
    expect(screen.getByText(/Limite.*-18/)).toBeTruthy();
  });

  it("mostra a conclusão por área nas Caixas de Sugestões e mantém as localizações pendentes", () => {
    routeModule.value = "suggestion_boxes";
    window.history.pushState({}, "", "/controlos/suggestion_boxes?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getByText("Conclusão por área")).toBeTruthy();
    expect(screen.getByText("1 de 3 localizações verificadas")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getAllByText("Caixa escritório").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pendente").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Registar área verificada" })).toBeTruthy();
  });

  it("filtra o histórico BPHF pelo tipo de verificação", async () => {
    const user = userEvent.setup();
    routeModule.value = "bphf";
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1");
    render(<ModuleControl />);

    const filter = screen.getByRole("combobox", { name: "Filtrar por tipo de verificação" });
    await user.click(filter);
    expect(screen.getByRole("option", { name: "Cacifos" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Cacifos" }));
    expect(screen.getByText("0 registos")).toBeTruthy();
    expect(screen.getByText("Não foram encontrados resultados com os filtros aplicados nesta data.")).toBeTruthy();
  });

  it("mostra a conclusão por linha nos Detetores de Metais e distingue linhas pendentes", async () => {
    routeModule.value = "metal_detectors";
    window.history.pushState({}, "", "/controlos/metal_detectors?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getByText("Conclusão por linha")).toBeTruthy();
    expect(screen.getAllByText(/Linha 1 — verificada/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Linha 2 — pendente/).length).toBeGreaterThan(0);
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("mantém os resultados da data selecionada visíveis quando o preenchimento já está fechado", () => {
    routeModule.value = "shelf_life";
    Object.assign(authorizationState, { allowed: false, taskId: null, dueAt: null, isPreviousPending: false, reason: "Este controlo já foi concluído." });
    window.history.pushState({}, "", "/controlos/shelf_life?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getByText("Preenchimento indisponível")).toBeTruthy();
    expect(screen.getByText("Resultados registados")).toBeTruthy();
    expect(screen.getAllByText("Higienização das mãos dos manipuladores").length).toBeGreaterThan(0);
    expect(screen.getByText("Sem desvios observados.")).toBeTruthy();
  });

  it("mostra quem registou e a hora de cada leitura de Temperaturas", () => {
    routeModule.value = "temperature_controls";
    Object.assign(authorizationState, { allowed: true, taskId: 513, dueAt: new Date("2026-08-20T12:00:00"), isPreviousPending: false, isFuturePlanned: false, reason: "Autorizado" });
    window.history.pushState({}, "", "/controlos/temperature_controls?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getByText("Consulta de resultados")).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.includes("Verificado em 20/08/26, 14:35 por Sabrina Esteves") === true)).toBeTruthy();
    expect(screen.getByText("Leitura estável.")).toBeTruthy();
    expect(screen.getByText("Conforme")).toBeTruthy();
  });

  it("permite preparar uma leitura independente para cada equipamento de Temperaturas", () => {
    routeModule.value = "temperature_controls";
    Object.assign(authorizationState, { allowed: true, taskId: 514, dueAt: new Date("2026-08-20T12:00:00"), isPreviousPending: false, isFuturePlanned: false, reason: "Autorizado" });
    window.history.pushState({}, "", "/controlos/temperature_controls?factoryId=2");
    render(<ModuleControl />);

    expect(screen.getByText("Câmara de Frio")).toBeTruthy();
    expect(screen.getByText("Arca de Congelação expedição")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Registar leitura deste equipamento" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Registar verificação de temperaturas" })).toBeNull();
  });

  it("filtra o histórico sensorial pelo nome do produto e permite limpar a pesquisa", async () => {
    const user = userEvent.setup();
    routeModule.value = "sensory";
    Object.assign(authorizationState, { allowed: true, taskId: null, dueAt: null, isPreviousPending: false, reason: "Autorizado" });
    window.history.pushState({}, "", "/controlos/sensory?factoryId=1");
    render(<ModuleControl />);

    expect(screen.getByText("Controlo sensorial — Broa da serra")).toBeTruthy();
    expect(screen.getByText("Controlo sensorial — Pão integral")).toBeTruthy();
    const filter = screen.getByLabelText("Filtrar por produto");
    await user.type(filter, "Pão integral");
    expect(screen.queryByText("Controlo sensorial — Broa da serra")).toBeNull();
    expect(screen.getByText("Controlo sensorial — Pão integral")).toBeTruthy();
    expect(screen.getByText("1 registo")).toBeTruthy();
    await user.clear(filter);
    expect(screen.getByText("Controlo sensorial — Broa da serra")).toBeTruthy();
    expect(screen.getByText("2 registos")).toBeTruthy();
  });

  it("permite preparar vários produtos no controlo sensorial sem remover o último cartão", async () => {
    const user = userEvent.setup();
    routeModule.value = "sensory";
    Object.assign(authorizationState, { allowed: true, taskId: null, dueAt: null, isPreviousPending: false, reason: "Autorizado" });
    window.history.pushState({}, "", "/controlos/sensory");
    render(<ModuleControl />);

    expect(screen.getByText("Produtos a verificar")).toBeTruthy();
    expect(screen.getAllByPlaceholderText("Produto acabado")).toHaveLength(1);
    expect(screen.getAllByLabelText("Fotografia do produto")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remover produto 1" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Adicionar produto" }));
    expect(screen.getAllByPlaceholderText("Produto acabado")).toHaveLength(2);
    expect(screen.getAllByLabelText("Fotografia do produto")).toHaveLength(2);
    expect(screen.getByText(/2 produtos preparados/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover produto 2" })).toHaveProperty("disabled", false);
  });

  it("carrega e pré-visualiza a fotografia do produto sensorial na respetiva ficha", async () => {
    const productPhoto = { url: "/manus-storage/produto.png", fileName: "produto.png", mimeType: "image/png" as const };
    uploadEvidenceMutate.mockImplementation((_input: unknown, options: { onSuccess?: (photo: typeof productPhoto) => void }) => options.onSuccess?.(productPhoto));
    routeModule.value = "sensory";
    Object.assign(authorizationState, { allowed: true, taskId: null, dueAt: null, isPreviousPending: false, reason: "Autorizado" });
    window.history.pushState({}, "", "/controlos/sensory");
    render(<ModuleControl />);

    const file = new File(["fotografia"], "produto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Fotografia do produto"), { target: { files: [file] } });
    await waitFor(() => expect(uploadEvidenceMutate).toHaveBeenCalledWith(expect.objectContaining({ module: "sensory", fileName: "produto.png", mimeType: "image/png" }), expect.any(Object)));
    expect(await screen.findByRole("img", { name: "Fotografia do produto: produto.png" })).toHaveProperty("src", expect.stringContaining("/manus-storage/produto.png"));
  });
});
