// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentLocation = "/controlos/fragile_items";
let isMobile = false;
let occurrenceScope = "all";
let activeProfile: { id: number; name: string; title: string; role: "technician" | "manager" | "viewer"; panelAccess?: string[]; externalPanelAccess?: string[] } = { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" };
const setLocation = vi.fn();

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: { name: "Joana Pina", email: "joana@example.com" }, logout: vi.fn() }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => isMobile }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => [currentLocation, setLocation] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { accessStatus: { invalidate: vi.fn() } } }),
    quality: {
      accessStatus: { useQuery: () => ({ isLoading: false, data: { activeProfile, canManage: activeProfile.role === "manager", profiles: [], canBootstrap: false, needsInitialSetup: false } }) },
      deactivatePinProfile: { useMutation: (options: { onSettled?: () => void } = {}) => ({ mutate: () => options.onSettled?.() }) },
    },
    occurrences: { access: { useQuery: () => ({ data: { role: "admin", scope: occurrenceScope } }) } },
  },
}));

import DashboardLayout from "../client/src/components/DashboardLayout";

describe("atalhos laterais dos painéis de controlo", () => {
  beforeEach(() => {
    cleanup();
    currentLocation = "/controlos/fragile_items";
    isMobile = false;
    occurrenceScope = "all";
    activeProfile = { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" };
    setLocation.mockClear();
    Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("mostra os painéis, marca a rota ativa e permite foco e ativação dos atalhos", async () => {
    render(<DashboardLayout><div>Conteúdo</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Controlos" })).toBeTruthy());

    const fragile = screen.getByRole("button", { name: "Quebráveis" });
    expect(fragile.getAttribute("data-active")).toBe("true");
    const controls = screen.getByRole("button", { name: "Controlos" });
    expect(controls).toBeTruthy();
    const controlPanel = screen.getByText("Controlos Operacionais").closest(".bg-slate-950");
    expect(controlPanel?.className).toContain("bg-slate-950");
    expect(controlPanel?.className).toContain("isolate");
    expect(controlPanel?.querySelector("button")?.className).toContain("[&>span:last-child]:!whitespace-normal");
    expect(controlPanel?.contains(screen.getByRole("button", { name: "BPHF" }))).toBe(true);
    expect(controlPanel?.contains(screen.queryByRole("button", { name: "Controlo sensorial de I&D" }))).toBe(false);
    expect((controlPanel?.compareDocumentPosition(screen.getByText("Painéis externos")) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver painel de controlos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "BPHF" }));
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/bphf");

    fragile.focus();
    expect(document.activeElement).toBe(fragile);
    expect(fragile.tagName).toBe("BUTTON");
    fireEvent.click(fragile);
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/fragile_items");

    fireEvent.click(screen.getByRole("button", { name: "Plataforma" }));
    expect(setLocation).toHaveBeenLastCalledWith("/plataforma");

    expect(screen.getByText("I&D interno")).toBeTruthy();
    expect(screen.getByText("I&D interno").closest("ul")?.className).toContain("bg-cyan-50/70");
    fireEvent.click(screen.getByRole("button", { name: "Controlo sensorial de I&D" }));
    expect(setLocation).toHaveBeenLastCalledWith("/id-sensorial");
    expect(screen.getByRole("button", { name: "I&D · Artisan" })).toBeTruthy();
  });

  it("abre os atalhos e permite navegar para um painel no fluxo de ecrã móvel", async () => {
    isMobile = true;
    render(<DashboardLayout><div>Conteúdo</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Controlos" })).toBeTruthy());
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Sensorial I&D" })).toBeNull();
    expect(screen.getByRole("button", { name: "Controlo sensorial de I&D" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quebráveis" }));
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/fragile_items");
  });

  it("disponibiliza o atalho de Ocorrências sem expor os menus da área histórica de reclamações", async () => {
    occurrenceScope = "reclamacoes";
    currentLocation = "/qualicontrol";
    render(<DashboardLayout workspace="quality"><div>Conteúdo</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Incidências" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Incidências" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reclamações a fornecedores" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nova reclamação" })).toBeNull();
  });

  it("apresenta o atalho direto de Incidências sem incluir os menus de Gestão de Ocorrências", async () => {
    render(<DashboardLayout workspace="quality"><div>Conteúdo</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Incidências" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Incidências" }));
    expect(setLocation).toHaveBeenLastCalledWith("/incidencias");
    expect(screen.queryByRole("button", { name: "Reclamações a fornecedores" })).toBeNull();
  });

  it("oculta os painéis não atribuídos a uma técnica e bloqueia a rota direta", async () => {
    activeProfile = { id: 1, name: "Técnica limitada", title: "Tec. Qualidade", role: "technician", panelAccess: ["dashboard", "operational_controls"], externalPanelAccess: ["artisan_rd"] };
    currentLocation = "/id-sensorial";
    render(<DashboardLayout workspace="quality"><div>Conteúdo de I&D</div></DashboardLayout>);
    await waitFor(() => expect(screen.getByText("Painel não autorizado")).toBeTruthy());
    expect(screen.getByRole("button", { name: "I&D · Artisan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gestão de Ocorrências" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestão de MP" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Controlo sensorial de I&D" })).toBeNull();
    expect(screen.getByRole("button", { name: "Controlos" })).toBeTruthy();
  });
});
