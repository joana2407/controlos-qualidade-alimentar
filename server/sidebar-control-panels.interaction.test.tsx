// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentLocation = "/controlos/fragile_items";
let isMobile = false;
let occurrenceScope = "all";
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
      accessStatus: { useQuery: () => ({ isLoading: false, data: { activeProfile: { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" }, canManage: true, profiles: [], canBootstrap: false, needsInitialSetup: false } }) },
      deactivatePinProfile: { useMutation: () => ({ mutate: vi.fn() }) },
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
    setLocation.mockClear();
    Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("mostra os painéis, marca a rota ativa e permite foco e ativação dos atalhos", () => {
    render(<DashboardLayout><div>Conteúdo</div></DashboardLayout>);

    const fragile = screen.getByRole("button", { name: "Quebráveis" });
    expect(fragile.getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("button", { name: "Controlos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "BPHF" }));
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/bphf");

    fragile.focus();
    expect(document.activeElement).toBe(fragile);
    expect(fragile.tagName).toBe("BUTTON");
    fireEvent.click(fragile);
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/fragile_items");

    fireEvent.click(screen.getByRole("button", { name: "Plataforma" }));
    expect(setLocation).toHaveBeenLastCalledWith("/plataforma");
  });

  it("abre os atalhos e permite navegar para um painel no fluxo de ecrã móvel", async () => {
    isMobile = true;
    render(<DashboardLayout><div>Conteúdo</div></DashboardLayout>);
    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Controlos" })).toBeTruthy());
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Quebráveis" }));
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/fragile_items");
  });

  it("disponibiliza o atalho de Ocorrências sem expor os menus da área histórica de reclamações", () => {
    occurrenceScope = "reclamacoes";
    currentLocation = "/qualicontrol";
    render(<DashboardLayout workspace="quality"><div>Conteúdo</div></DashboardLayout>);
    expect(screen.getByRole("button", { name: "Ocorrências" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reclamações a fornecedores" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nova reclamação" })).toBeNull();
  });

  it("apresenta o atalho direto de Ocorrências sem incluir os menus de Gestão de Ocorrências", () => {
    render(<DashboardLayout workspace="quality"><div>Conteúdo</div></DashboardLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Ocorrências" }));
    expect(setLocation).toHaveBeenLastCalledWith("/incidencias");
    expect(screen.queryByRole("button", { name: "Reclamações a fornecedores" })).toBeNull();
  });
});
