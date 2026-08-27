// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dailyReportArchiveHistory: { invalidate: vi.fn() } } }),
    quality: {
      dailyReportArchiveHistory: { useQuery: () => ({ data: [{ id: 22, operationalDate: new Date("2026-08-21T12:00:00Z"), revision: 1, archiveKind: "initial", backupFileKey: "qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V1.xlsx", backupFileUrl: "/manus-storage/qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V1.xlsx", backupGeneratedAt: new Date("2026-08-21T22:55:00Z"), backupSizeBytes: 2312 }], isLoading: false }) },
      generateDailyReportArchiveBackup: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
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
  });
});
