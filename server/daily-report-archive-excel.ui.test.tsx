// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { writeFile, createManualArchive } = vi.hoisted(() => ({
  writeFile: vi.fn(),
  createManualArchive: vi.fn(),
}));
const manualArchiveResult = {
  created: true,
  backup: {
    url: "/manus-storage/qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V2.xlsx",
    key: "qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V2.xlsx",
  },
};

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, writeFile };
});

const archive = {
  id: 73,
  operationalDate: new Date("2026-08-21T12:00:00Z"),
  revision: 2,
  archiveKind: "retroactive",
  createdAt: new Date("2026-08-23T10:00:00Z"),
  createdBy: "Joana Pina",
  revisionReason: "Registo retroativo concluído.",
  snapshot: { plannedTasks: [{ module: "bphf", responsible: "Sabrina Esteves", status: "completed" }], controlEntries: [{ title: "Verificação de BPHF", module: "bphf", area: "Produção", result: "C", completedAt: new Date("2026-08-21T14:00:00Z") }], incidences: [], dailyNotes: [{ note: "Sem desvios críticos." }] },
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { reports: { invalidate: vi.fn() }, dailyReportArchiveAttention: { invalidate: vi.fn() }, dailyReportArchiveHistory: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [], collaborators: [] } }) },
      reports: { useQuery: () => ({ data: { modules: [], areas: [], trends: [], filteredEntries: [], filteredSummary: { total: 0, conformity: 0 } }, isLoading: false }) },
      dailyReportArchiveHistory: { useQuery: () => ({ data: [{ ...archive, controls: 1, incidences: 0 }], isLoading: false }) },
      dailyReportArchiveDetail: { useQuery: (input: { id: number }) => ({ data: input.id ? archive : null, isLoading: false }) },
      markDailyReportArchiveViewed: { useMutation: () => ({ mutate: vi.fn() }) },
      createManualDailyReportArchive: { useMutation: (options?: { onSuccess?: (result: typeof manualArchiveResult) => void }) => ({ isPending: false, mutate: (input: unknown) => { createManualArchive(input); options?.onSuccess?.(manualArchiveResult); } }) },
      updateControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      deleteControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ activeProfile: { id: 3, name: "Joana Pina" }, canManage: true }) }));

import Reports from "../client/src/pages/Reports";

afterEach(() => { cleanup(); vi.restoreAllMocks(); createManualArchive.mockClear(); });

describe("exportação Excel do arquivo diário", () => {
  it("permite selecionar uma versão arquivada e descarregá-la em Excel", () => {
    render(<Reports />);

    expect(screen.getByRole("button", { name: /exportar versão excel/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("combobox", { name: "Versão arquivada a exportar para Excel" }));
    fireEvent.click(screen.getByRole("option", { name: /v2/i }));
    fireEvent.click(screen.getByRole("button", { name: /exportar versão excel/i }));

    expect(writeFile).toHaveBeenCalledWith(expect.anything(), "arquivo-diario-2026-08-21-V2.xlsx", { compression: true });
  });

  it("permite à Responsável guardar o relatório do dia selecionado nos Backups diários", () => {
    const { container } = render(<Reports />);
    const [startDate, endDate] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fireEvent.change(startDate!, { target: { value: "2026-08-21" } });
    fireEvent.change(endDate!, { target: { value: "2026-08-21" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar backup diário/i }));

    expect(createManualArchive).toHaveBeenCalledWith({ operationalDate: "2026-08-21" });
    expect(screen.getByRole("link", { name: "Descarregar backup" }).getAttribute("href")).toContain("relatorio-diario-2026-08-21-V2.xlsx");
  });
});
