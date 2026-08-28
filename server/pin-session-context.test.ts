import { beforeEach, describe, expect, it, vi } from "vitest";
import { qualityPinProfiles, qualityPinSessions } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { hashSessionToken, QUALITY_OPERATOR_COOKIE } from "./team-access";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

describe("restauração de sessão operacional por PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restaura o perfil Responsável pelo token PIN mesmo sem sessão Manus", async () => {
    const session = {
      profileId: 3,
      tokenHash: hashSessionToken("sessao-pin-teste"),
      oauthOpenId: "utilizador-manus-anterior",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    const profile = {
      id: 3,
      name: "Joana Pina",
      title: "Resp. Qualidade",
      role: "manager",
      active: "true",
    };
    const database = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => table === qualityPinSessions ? [session] : table === qualityPinProfiles ? [profile] : [],
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(database as any);
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(new Error("Sem sessão Manus"));

    const context = await createContext({
      req: { headers: { cookie: `${QUALITY_OPERATOR_COOKIE}=sessao-pin-teste` } } as any,
      res: {} as any,
    });

    expect(context.user).toBeNull();
    expect(context.operatorProfile).toEqual({ id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" });
  });
});
