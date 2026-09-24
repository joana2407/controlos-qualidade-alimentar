import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  factories,
  rdSensoryEvaluations,
  rdSensoryProjects,
  rdSensoryTests,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut } from "../storage";
import {
  qualityManagerProcedure,
  qualityOperatorProcedure,
  qualitySessionProcedure,
  router,
} from "../_core/trpc";

const scoreSchema = z.number().int().min(1).max(5);
const photoSchema = z.object({
  key: z.string().min(1),
  url: z.string().startsWith("/manus-storage/"),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
const evaluationInput = z.object({
  projectId: z.number().int(),
  testId: z.number().int().positive().optional(),
  evaluatedAt: z.coerce.date(),
  lifeDay: z.number().int().min(0).max(999),
  tasterName: z.string().trim().min(2).max(160),
  appearanceScore: scoreSchema,
  aftertasteScore: scoreSchema,
  colourScore: scoreSchema,
  smellScore: scoreSchema,
  textureScore: scoreSchema,
  flavourScore: scoreSchema,
  observations: z.string().trim().max(3000).optional(),
  suggestions: z.string().trim().max(3000).optional(),
  photos: z.array(photoSchema).max(5).optional(),
});
const projectInput = z.object({
  title: z.string().trim().min(3).max(180),
  product: z.string().trim().min(2).max(180),
  factoryId: z.number().int().positive().nullable().optional(),
  productionLot: z.string().trim().max(100).optional(),
  productionDate: z.coerce.date().optional(),
  intendedShelfLifeDays: z.number().int().min(1).max(999).optional(),
  intendedExpiryDate: z.coerce.date().optional(),
});
const testInput = z.object({
  projectId: z.number().int(),
  title: z.string().trim().min(2).max(180),
  formulation: z.string().trim().max(180).optional(),
  productionLot: z.string().trim().max(100).optional(),
  productionDate: z.coerce.date().optional(),
  intendedShelfLifeDays: z.number().int().min(1).max(999).optional(),
  intendedExpiryDate: z.coerce.date().optional(),
});

const scoreFields = [
  "appearanceScore",
  "aftertasteScore",
  "colourScore",
  "smellScore",
  "textureScore",
  "flavourScore",
] as const;

type EvaluationRow = typeof rdSensoryEvaluations.$inferSelect;

export function calculateRDSensoryWeightedScore(input: z.infer<typeof evaluationInput>) {
  return Math.round(
    (input.appearanceScore * 0.1 +
      input.aftertasteScore * 0.15 +
      input.colourScore * 0.15 +
      input.smellScore * 0.1 +
      input.textureScore * 0.1 +
      input.flavourScore * 0.4) *
      100
  );
}

function averageScore(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
    : null;
}

function scoreMode(values: number[]) {
  if (!values.length) return null;
  const frequencies = values.reduce((all, value) => {
    all.set(value, (all.get(value) ?? 0) + 1);
    return all;
  }, new Map<number, number>());
  return Array.from(frequencies.entries()).sort((first, second) =>
    second[1] === first[1] ? second[0] - first[0] : second[1] - first[1]
  )[0]?.[0] ?? null;
}

export function buildRDSensoryTimeline(evaluations: EvaluationRow[]) {
  return Array.from(new Set(evaluations.map(evaluation => evaluation.lifeDay)))
    .sort((first, second) => first - second)
    .map(lifeDay => {
      const group = evaluations.filter(evaluation => evaluation.lifeDay === lifeDay);
      const criteria = Object.fromEntries(
        scoreFields.map(field => [
          field,
          {
            average: averageScore(group.map(evaluation => evaluation[field])),
            mode: scoreMode(group.map(evaluation => evaluation[field])),
          },
        ])
      );
      return {
        lifeDay,
        evaluations: group.length,
        weightedAverage: averageScore(group.map(evaluation => evaluation.weightedScore / 100)),
        criteria,
      };
    });
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "A base de dados não está disponível.",
    });
  }
  return db;
}

function testCode(projectCode: string) {
  return `${projectCode}-T${Date.now().toString(36).toUpperCase()}`.slice(0, 80);
}

async function projectDetail(db: Awaited<ReturnType<typeof requireDb>>, projectId: number) {
  const project = (await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.id, projectId), isNull(rdSensoryProjects.deletedAt))).limit(1))[0];
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
  const evaluations = await db
    .select()
    .from(rdSensoryEvaluations)
    .where(and(eq(rdSensoryEvaluations.projectId, projectId), isNull(rdSensoryEvaluations.deletedAt)))
    .orderBy(desc(rdSensoryEvaluations.evaluatedAt), desc(rdSensoryEvaluations.id));
  const tests = await db
    .select()
    .from(rdSensoryTests)
    .where(and(eq(rdSensoryTests.projectId, projectId), isNull(rdSensoryTests.deletedAt)))
    .orderBy(desc(rdSensoryTests.createdAt), desc(rdSensoryTests.id));
  const computedFinalScore = averageScore(evaluations.map(evaluation => evaluation.weightedScore / 100));
  return {
    ...project,
    computedFinalScore,
    timeline: buildRDSensoryTimeline(evaluations),
    evaluations,
    tests: tests.map(test => {
      const testEvaluations = evaluations.filter(evaluation => evaluation.testId === test.id);
      return {
        ...test,
        evaluations: testEvaluations,
        computedFinalScore: averageScore(testEvaluations.map(evaluation => evaluation.weightedScore / 100)),
      };
    }),
    legacyEvaluations: evaluations.filter(evaluation => evaluation.testId === null),
  };
}

export const rdSensoryRouter = router({
  listProjects: qualitySessionProcedure
    .input(z.object({ status: z.enum(["active", "closed", "all"]).default("active") }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const projects = input?.status && input.status !== "all"
        ? await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.status, input.status), isNull(rdSensoryProjects.deletedAt))).orderBy(desc(rdSensoryProjects.updatedAt))
        : await db.select().from(rdSensoryProjects).where(isNull(rdSensoryProjects.deletedAt)).orderBy(desc(rdSensoryProjects.updatedAt));
      const evaluations = await db.select().from(rdSensoryEvaluations).where(isNull(rdSensoryEvaluations.deletedAt)).orderBy(desc(rdSensoryEvaluations.evaluatedAt));
      const tests = await db.select().from(rdSensoryTests).where(isNull(rdSensoryTests.deletedAt));
      return projects.map(project => {
        const projectEvaluations = evaluations.filter(evaluation => evaluation.projectId === project.id);
        const projectTests = tests.filter(test => test.projectId === project.id);
        return {
          ...project,
          evaluationCount: projectEvaluations.length,
          testCount: projectTests.length,
          activeTestCount: projectTests.filter(test => test.status === "active").length,
          latestLifeDay: projectEvaluations.length ? Math.max(...projectEvaluations.map(evaluation => evaluation.lifeDay)) : null,
          computedFinalScore: averageScore(projectEvaluations.map(evaluation => evaluation.weightedScore / 100)),
        };
      });
    }),

  getProject: qualitySessionProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => projectDetail(await requireDb(), input.projectId)),

  createProject: qualityOperatorProcedure
    .input(projectInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = ctx.operatorProfile!;
      if (input.factoryId) {
        const factory = (await db.select().from(factories).where(eq(factories.id, input.factoryId)).limit(1))[0];
        if (!factory) throw new TRPCError({ code: "BAD_REQUEST", message: "A fábrica selecionada não existe." });
      }
      const code = `ID-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      const inserted = await db.insert(rdSensoryProjects).values({
        ...input,
        code,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdByTitle: profile.title,
        createdBy: ctx.user!.openId,
      }).$returningId();
      const projectId = Number(inserted[0]!.id);
      await db.insert(rdSensoryTests).values({
        projectId,
        code: `${code}-T01`.slice(0, 80),
        title: "Teste 1",
        formulation: null,
        productionLot: input.productionLot || null,
        productionDate: input.productionDate || null,
        intendedShelfLifeDays: input.intendedShelfLifeDays || null,
        intendedExpiryDate: input.intendedExpiryDate || null,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdBy: ctx.user!.openId,
      });
      return projectDetail(db, projectId);
    }),

  createTest: qualityOperatorProcedure
    .input(testInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const project = (await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.id, input.projectId), isNull(rdSensoryProjects.deletedAt))).limit(1))[0];
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
      if (project.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "Um projeto fechado não aceita novos testes." });
      const profile = ctx.operatorProfile!;
      const { projectId, ...test } = input;
      await db.insert(rdSensoryTests).values({
        ...test,
        code: testCode(project.code),
        formulation: test.formulation || null,
        productionLot: test.productionLot || null,
        productionDate: test.productionDate || null,
        intendedShelfLifeDays: test.intendedShelfLifeDays || null,
        intendedExpiryDate: test.intendedExpiryDate || null,
        projectId,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdBy: ctx.user!.openId,
      });
      return projectDetail(db, projectId);
    }),

  addEvaluation: qualityOperatorProcedure
    .input(evaluationInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const project = (await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.id, input.projectId), isNull(rdSensoryProjects.deletedAt))).limit(1))[0];
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
      const profile = ctx.operatorProfile!;
      let testId = input.testId;
      if (!testId) {
        const firstTest = (await db.select().from(rdSensoryTests).where(and(eq(rdSensoryTests.projectId, project.id), eq(rdSensoryTests.status, "active"), isNull(rdSensoryTests.deletedAt))).orderBy(desc(rdSensoryTests.createdAt)).limit(1))[0];
        if (firstTest) testId = firstTest.id;
        else {
          const insertedTest = await db.insert(rdSensoryTests).values({
            projectId: project.id,
            code: testCode(project.code),
            title: "Teste 1",
            createdByProfileId: profile.id,
            createdByName: profile.name,
            createdBy: ctx.user!.openId,
          }).$returningId();
          testId = Number(insertedTest[0]!.id);
        }
      }
      const test = (await db.select().from(rdSensoryTests).where(and(eq(rdSensoryTests.id, testId), eq(rdSensoryTests.projectId, project.id), isNull(rdSensoryTests.deletedAt))).limit(1))[0];
      if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Teste de I&D não encontrado neste projeto." });
      if (project.status === "closed" || test.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "O projeto ou teste está fechado e não aceita novas avaliações." });
      const { testId: _requestedTestId, ...evaluation } = input;
      await db.insert(rdSensoryEvaluations).values({
        ...evaluation,
        testId,
        weightedScore: calculateRDSensoryWeightedScore(input),
        photos: input.photos ?? null,
        tasterProfileId: input.tasterName === profile.name ? profile.id : null,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdBy: ctx.user!.openId,
      });
      return projectDetail(db, input.projectId);
    }),

  uploadEvaluationPhoto: qualityOperatorProcedure
    .input(z.object({
      projectId: z.number().int(),
      fileName: z.string().min(1).max(255),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      dataUrl: z.string().min(20).max(7_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const project = (await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.id, input.projectId), isNull(rdSensoryProjects.deletedAt))).limit(1))[0];
      if (!project || project.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "O projeto não está disponível para anexar fotografias." });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { key, url } = await storagePut(`rd-sensory/${input.projectId}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
      return { key, url, fileName: input.fileName, mimeType: input.mimeType };
    }),

  updateProject: qualityManagerProcedure
    .input(projectInput.extend({ projectId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await projectDetail(db, input.projectId);
      if (input.factoryId) {
        const factory = (await db.select().from(factories).where(eq(factories.id, input.factoryId)).limit(1))[0];
        if (!factory) throw new TRPCError({ code: "BAD_REQUEST", message: "A fábrica selecionada não existe." });
      }
      const { projectId, ...changes } = input;
      await db.update(rdSensoryProjects).set(changes).where(eq(rdSensoryProjects.id, projectId));
      return projectDetail(db, projectId);
    }),

  updateTest: qualityManagerProcedure
    .input(testInput.omit({ projectId: true }).extend({ testId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const test = (await db.select().from(rdSensoryTests).where(and(eq(rdSensoryTests.id, input.testId), isNull(rdSensoryTests.deletedAt))).limit(1))[0];
      if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Teste de I&D não encontrado." });
      const { testId, ...changes } = input;
      await db.update(rdSensoryTests).set({
        ...changes,
        formulation: changes.formulation || null,
        productionLot: changes.productionLot || null,
        productionDate: changes.productionDate || null,
        intendedShelfLifeDays: changes.intendedShelfLifeDays || null,
        intendedExpiryDate: changes.intendedExpiryDate || null,
      }).where(eq(rdSensoryTests.id, testId));
      return projectDetail(db, test.projectId);
    }),

  updateEvaluation: qualityOperatorProcedure
    .input(evaluationInput.extend({ evaluationId: z.number().int() }).omit({ projectId: true }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const evaluation = (await db.select().from(rdSensoryEvaluations).where(and(eq(rdSensoryEvaluations.id, input.evaluationId), isNull(rdSensoryEvaluations.deletedAt))).limit(1))[0];
      if (!evaluation) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação de I&D não encontrada." });
      const project = (await db.select().from(rdSensoryProjects).where(and(eq(rdSensoryProjects.id, evaluation.projectId), isNull(rdSensoryProjects.deletedAt))).limit(1))[0];
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
      const profile = ctx.operatorProfile!;
      const isAuthor = evaluation.createdByProfileId === profile.id;
      if (profile.role !== "manager" && !isAuthor)
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas a Técnica que registou esta avaliação pode editá-la." });
      if (project.status === "closed" && profile.role !== "manager")
        throw new TRPCError({ code: "FORBIDDEN", message: "Um projeto fechado só pode ser alterado pela Responsável de Qualidade." });
      const { evaluationId, ...changes } = input;
      await db.update(rdSensoryEvaluations).set({
        ...changes,
        weightedScore: calculateRDSensoryWeightedScore({ ...changes, projectId: evaluation.projectId }),
        updatedByProfileId: profile.id,
        updatedByName: profile.name,
      }).where(eq(rdSensoryEvaluations.id, evaluationId));
      return projectDetail(db, evaluation.projectId);
    }),

  deleteEvaluation: qualityManagerProcedure
    .input(z.object({ evaluationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const evaluation = (await db.select().from(rdSensoryEvaluations).where(and(eq(rdSensoryEvaluations.id, input.evaluationId), isNull(rdSensoryEvaluations.deletedAt))).limit(1))[0];
      if (!evaluation) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação de I&D não encontrada." });
      await db.update(rdSensoryEvaluations).set({ deletedAt: new Date(), deletedByProfileId: ctx.operatorProfile!.id, deletedByName: ctx.operatorProfile!.name }).where(eq(rdSensoryEvaluations.id, evaluation.id));
      return { success: true, projectId: evaluation.projectId };
    }),

  deleteProject: qualityManagerProcedure
    .input(z.object({ projectId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await projectDetail(db, input.projectId);
      const deletion = { deletedAt: new Date(), deletedByProfileId: ctx.operatorProfile!.id, deletedByName: ctx.operatorProfile!.name };
      await db.update(rdSensoryEvaluations).set(deletion).where(and(eq(rdSensoryEvaluations.projectId, input.projectId), isNull(rdSensoryEvaluations.deletedAt)));
      await db.update(rdSensoryTests).set(deletion).where(and(eq(rdSensoryTests.projectId, input.projectId), isNull(rdSensoryTests.deletedAt)));
      await db.update(rdSensoryProjects).set(deletion).where(eq(rdSensoryProjects.id, input.projectId));
      return { success: true };
    }),

  closeProject: qualityManagerProcedure
    .input(z.object({
      projectId: z.number().int(),
      finalAssessment: z.string().trim().min(2).max(3000),
      closingNotes: z.string().trim().max(3000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const project = await projectDetail(db, input.projectId);
      if (project.status === "closed") throw new TRPCError({ code: "CONFLICT", message: "O projeto já se encontra fechado." });
      if (!project.evaluations.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Registe pelo menos uma avaliação antes de fechar o projeto." });
      const profile = ctx.operatorProfile!;
      await db.update(rdSensoryProjects).set({
        status: "closed",
        finalScore: Math.round((project.computedFinalScore ?? 0) * 100),
        finalAssessment: input.finalAssessment,
        closingNotes: input.closingNotes || null,
        closedAt: new Date(),
        closedByProfileId: profile.id,
        closedByName: profile.name,
      }).where(eq(rdSensoryProjects.id, input.projectId));
      return projectDetail(db, input.projectId);
    }),

  closeTest: qualityManagerProcedure
    .input(z.object({
      testId: z.number().int(),
      finalAssessment: z.string().trim().min(2).max(3000),
      closingNotes: z.string().trim().max(3000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const test = (await db.select().from(rdSensoryTests).where(and(eq(rdSensoryTests.id, input.testId), isNull(rdSensoryTests.deletedAt))).limit(1))[0];
      if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Teste de I&D não encontrado." });
      if (test.status === "closed") throw new TRPCError({ code: "CONFLICT", message: "O teste já se encontra fechado." });
      const evaluations = await db.select().from(rdSensoryEvaluations).where(and(eq(rdSensoryEvaluations.testId, input.testId), isNull(rdSensoryEvaluations.deletedAt)));
      if (!evaluations.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Registe pelo menos uma avaliação antes de fechar o teste." });
      const profile = ctx.operatorProfile!;
      await db.update(rdSensoryTests).set({
        status: "closed",
        finalScore: Math.round((averageScore(evaluations.map(evaluation => evaluation.weightedScore / 100)) ?? 0) * 100),
        finalAssessment: input.finalAssessment,
        closingNotes: input.closingNotes || null,
        closedAt: new Date(),
        closedByProfileId: profile.id,
        closedByName: profile.name,
      }).where(eq(rdSensoryTests.id, input.testId));
      return projectDetail(db, test.projectId);
    }),
});
