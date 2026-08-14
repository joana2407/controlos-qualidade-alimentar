import { beforeEach, describe, expect, it, vi } from "vitest";
import { occurrenceAccessProfiles, occurrences } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { occurrencesRouter } from "./routers/occurrences";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

const today = new Date();
const rows = [
  { id: 1, number: 1, occurredOn: new Date("2026-08-01"), factoryCode: "F1_FATIADO", type: "NC", origin: "I", description: "Desvio de higiene", status: "ABERTO", implementationDueOn: new Date("2026-08-10"), effectiveness: "", createdBy: "operator", updatedBy: "operator", recurrent: false },
  { id: 2, number: 2, occurredOn: new Date("2026-08-05"), factoryCode: "F2_GRANEL", type: "Nnc", origin: "R", description: "Reclamação de cliente", status: "FECHADO", implementationDueOn: new Date("2026-08-18"), effectiveness: "", createdBy: "operator", updatedBy: "operator", recurrent: false },
  { id: 3, number: 3, occurredOn: new Date("2026-08-12"), factoryCode: "F1_FATIADO", type: "NC", origin: "AI", description: "Auditoria interna", status: "FECHADO", implementationDueOn: new Date("2026-08-25"), effectiveness: "Satisfatória", createdBy: "operator", updatedBy: "operator", recurrent: false },
] as any[];
const accessRows: any[] = [];

const user = { id: 1, openId: "quality-pin-1", name: "Joana", email: null, loginMethod: "quality-pin", role: "admin" as const, createdAt: today, updatedAt: today, lastSignedIn: today };
function context(role: "technician" | "manager"): TrpcContext { return { user, operatorProfile: { id: role === "manager" ? 3 : 1, name: role === "manager" ? "Joana Pina" : "Sabrina Esteves", title: role === "manager" ? "Resp. Qualidade" : "Tec. Qualidade", role }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] }; }
function mockDatabase() {
  return {
    select: () => ({ from: (table: unknown) => { const source = table === occurrences ? rows : table === occurrenceAccessProfiles ? accessRows : []; const query = { limit: async () => source, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(source).then(resolve) }; return { orderBy: () => query, then: query.then, where: () => query }; } }),
    insert: () => ({ values: () => ({ $returningId: async () => [{ id: 4 }], onDuplicateKeyUpdate: async () => [] }) }),
    update: () => ({ set: () => ({ where: async () => ({ success: true }) }) }),
    delete: () => ({ where: async () => ({ success: true }) }),
  };
}

describe("router de ocorrências integrado", () => {
  beforeEach(() => { vi.clearAllMocks(); accessRows.length = 0; vi.mocked(getDb).mockResolvedValue(mockDatabase() as any); });

  it("preserva os indicadores do dashboard com filtros, prazos e eficácia", async () => {
    const dashboard = await occurrencesRouter.createCaller(context("technician")).dashboard({ factoryCode: "F1_FATIADO" });
    expect(dashboard.total).toBe(2);
    expect(dashboard.open).toBe(1);
    expect(dashboard.closed).toBe(1);
    expect(dashboard.overdue).toBe(1);
    expect(dashboard.withoutEffectiveness).toBe(0);
    expect(dashboard.byOrigin).toEqual(expect.arrayContaining([{ origin: "I", count: 1 }, { origin: "AI", count: 1 }]));
  });

  it("permite a uma técnica registar a ocorrência com os campos preservados", async () => {
    const result = await occurrencesRouter.createCaller(context("technician")).create({ occurredOn: "2026-08-14", type: "NC", origin: "I", factoryCode: "F3_SEM_GLUTEN", description: "Desvio registado", brcRequirement: "4.11", correction: "Segregar produto", correctiveAction: "Rever instrução", responsible: "Sabrina", implementationDueOn: "2026-08-20" });
    expect(result).toEqual({ id: 4 });
  });

  it("permite a uma técnica atualizar o tratamento sem poder avaliar a eficácia", async () => {
    await expect(occurrencesRouter.createCaller(context("technician")).update({ id: 1, data: { correction: "Produto segregado", correctiveAction: "Rever instrução", responsible: "Sabrina", implementationDueOn: "2026-08-20", effectiveness: null } })).resolves.toEqual({ success: true });
  });

  it("reserva a avaliação de eficácia à Responsável de Qualidade", async () => {
    await expect(occurrencesRouter.createCaller(context("technician")).updateEffectiveness({ id: 1, effectiveness: "Satisfatória" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(occurrencesRouter.createCaller(context("manager")).updateEffectiveness({ id: 1, effectiveness: "Satisfatória" })).resolves.toEqual({ success: true });
  });

  it("preserva as sugestões assistidas de BRC e tratamento para a equipa", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ requisitoBRC: "4.11", causaRaiz: "A instrução não foi seguida." }) } }] } as any).mockResolvedValueOnce({ choices: [{ message: { content: "Segregar o produto e reforçar a instrução de limpeza." } }] } as any);
    const caller = occurrencesRouter.createCaller(context("technician"));
    await expect(caller.suggestBrc({ description: "Higienização insuficiente numa linha de produção." })).resolves.toEqual({ requirement: "4.11", rootCause: "A instrução não foi seguida." });
    await expect(caller.suggestTreatment({ kind: "correction", description: "Higienização insuficiente numa linha de produção." })).resolves.toEqual({ suggestion: "Segregar o produto e reforçar a instrução de limpeza." });
  });

  it("aplica o papel de consulta e o âmbito de reclamações configurados por perfil PIN", async () => {
    accessRows.push({ qualityProfileId: 1, role: "gestao", scope: "all" });
    await expect(occurrencesRouter.createCaller(context("technician")).create({ occurredOn: "2026-08-14", type: "NC", origin: "I", description: "Ocorrência bloqueada para perfil de consulta." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    accessRows[0] = { qualityProfileId: 1, role: "user", scope: "reclamacoes" };
    await expect(occurrencesRouter.createCaller(context("technician")).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permite à Responsável configurar papel e âmbito preservados", async () => {
    await expect(occurrencesRouter.createCaller(context("manager")).updateAccessProfile({ qualityProfileId: 1, role: "gestao", scope: "reclamacoes" })).resolves.toEqual({ success: true });
  });
});
