// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const backupMocks = vi.hoisted(() => ({ bulk: vi.fn(), single: vi.fn() }));

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dailyReportArchiveHistory: { invalidate: vi.fn() } } }),
    quality: {
      dailyReportArchiveHistory: { useQuery: () => ({ data: [{ id: 22, operationalDate: new Date("2026-08-21T12:00:00Z"), revision: 1, archiveKind: "initial", backupFileKey: "qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V1.xlsx", backupFileUrl: "/manus-storage/qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V1.xlsx", backupGeneratedAt: new Date("2026-08-21T22:55:00Z"), backupSizeBytes: 2312 }, { id: 23, operationalDate: new Date("2026-08-22T12:00:00Z"), revision: 1, archiveKind: "initial", backupFileKey: null, backupFileUrl: null, backupGeneratedAt: null, backupSizeBytes: null }], isLoading: false }) },
      generateDailyReportArchiveBackup: { useMutation: () => ({ isPending: false, mutate: backupMocks.single }) },
      generateMissingDailyReportArchiveBackups: { useMutation: () => ({ isPending: false, mutate: backupMocks.bulk }) },
    },
  },
}));

import DailyBackups from "../client/src/pages/DailyBackups";

afterEach(cleanup);

describe("pasta de backups diários", () => {
  it("mostra o ficheiro arquivado e disponibiliza a respetiva descarga", () => {
    render(<DailyBackups />);

    expect(screen.getByRole("heading", { name: "Backups diários" })).toBeTruthy();
    expect(screen.getByText("relatorio-diario-2026-08-21-V1.xlsx")).toBeTruthy();
    expect(screen.getByText("Guardado")).toBeTruthy();
    expect(screen.getByRole("link", { name: /descarregar/i }).getAttribute("href")).toContain("/manus-storage/qualicontrol/backups-diarios/");
    expect(screen.getByRole("button", { name: /gerar 1 em falta/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar Cópia de Segurança" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar Cópia de Segurança" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /gerar 1 em falta/i }));
    expect(backupMocks.bulk).toHaveBeenCalledTimes(1);
  });

  it("filtra os ficheiros pelo intervalo inclusivo da data operacional", () => {
    render(<DailyBackups />);

    fireEvent.change(screen.getByLabelText("Data inicial dos backups"), { target: { value: "2026-08-22" } });
    fireEvent.change(screen.getByLabelText("Data final dos backups"), { target: { value: "2026-08-22" } });

    expect(screen.queryByText("relatorio-diario-2026-08-21-V1.xlsx")).toBeNull();
    expect(screen.getByText("relatorio-diario-2026-08-22-V1.xlsx")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("relatorio-diario-2026-08-21-V1.xlsx")).toBeTruthy();
  });
});
