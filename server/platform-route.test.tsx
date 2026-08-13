// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../client/src/components/ErrorBoundary", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../client/src/contexts/ThemeContext", () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import App from "../client/src/App";

describe("rota da plataforma", () => {
  beforeEach(() => window.history.pushState({}, "", "/plataforma"));
  afterEach(cleanup);

  it("apresenta a página da plataforma no respetivo caminho", () => {
    render(<App />);
    expect(screen.getByText("Qualidade alimentar organizada por ação.")).toBeTruthy();
  });
});
