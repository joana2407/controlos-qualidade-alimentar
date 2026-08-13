// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentLocation = "/controlos/fragile_items";
let isMobile = false;
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
  },
}));

import DashboardLayout from "../client/src/components/DashboardLayout";

describe("atalhos laterais dos painéis de controlo", () => {
  beforeEach(() => {
    cleanup();
    currentLocation = "/controlos/fragile_items";
    isMobile = false;
    setLocation.mockClear();
    Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("mostra os painéis, marca a rota ativa e permite foco e ativação dos atalhos", () => {
    render(<DashboardLayout><div>Conteúdo</div></DashboardLayout>);

    const fragile = screen.getByRole("button", { name: "Quebráveis" });
    expect(fragile.getAttribute("data-active")).toBe("true");
    expect(screen.getByText("Painéis de controlo")).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText("Painéis de controlo")).toBeTruthy());
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Quebráveis" }));
    expect(setLocation).toHaveBeenLastCalledWith("/controlos/fragile_items");
  });
});
