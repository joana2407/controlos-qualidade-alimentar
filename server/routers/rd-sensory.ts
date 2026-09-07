import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  rdSensoryEvaluations,
  rdSensoryProjects,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  qualityManagerProcedure,
  qualityOperatorProcedure,
  qualitySessionProcedure,
  router,
} from "../_core/trpc";

const scoreSchema = z.number().int().min(1).max(5);
const evaluationInput = z.object({
  projectId: z.number().int(),
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

async function projectDetail(db: Awaited<ReturnType<typeof requireDb>>, projectId: number) {
  const project = (await db.select().from(rdSensoryProjects).where(eq(rdSensoryProjects.id, projectId)).limit(1))[0];
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
  const evaluations = await db
    .select()
    .from(rdSensoryEvaluations)
    .where(eq(rdSensoryEvaluations.projectId, projectId))
    .orderBy(desc(rdSensoryEvaluations.evaluatedAt), desc(rdSensoryEvaluations.id));
  const computedFinalScore = averageScore(evaluations.map(evaluation => evaluation.weightedScore / 100));
  return {
    ...project,
    computedFinalScore,
    timeline: buildRDSensoryTimeline(evaluations),
    evaluations,
  };
}

export const rdSensoryRouter = router({
  listProjects: qualitySessionProcedure
    .input(z.object({ status: z.enum(["active", "closed", "all"]).default("active") }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const projects = input?.status && input.status !== "all"
        ? await db.select().from(rdSensoryProjects).where(eq(rdSensoryProjects.status, input.status)).orderBy(desc(rdSensoryProjects.updatedAt))
        : await db.select().from(rdSensoryProjects).orderBy(desc(rdSensoryProjects.updatedAt));
      const evaluations = await db.select().from(rdSensoryEvaluations).orderBy(desc(rdSensoryEvaluations.evaluatedAt));
      return projects.map(project => {
        const projectEvaluations = evaluations.filter(evaluation => evaluation.projectId === project.id);
        return {
          ...project,
          evaluationCount: projectEvaluations.length,
          latestLifeDay: projectEvaluations.length ? Math.max(...projectEvaluations.map(evaluation => evaluation.lifeDay)) : null,
          computedFinalScore: averageScore(projectEvaluations.map(evaluation => evaluation.weightedScore / 100)),
        };
      });
    }),

  getProject: qualitySessionProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => projectDetail(await requireDb(), input.projectId)),

  createProject: qualityManagerProcedure
    .input(z.object({
      title: z.string().trim().min(3).max(180),
      product: z.string().trim().min(2).max(180),
      productionLot: z.string().trim().max(100).optional(),
      productionDate: z.coerce.date().optional(),
      intendedShelfLifeDays: z.number().int().min(1).max(999).optional(),
      intendedExpiryDate: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = ctx.operatorProfile!;
      const code = `ID-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      const inserted = await db.insert(rdSensoryProjects).values({
        ...input,
        code,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdByTitle: profile.title,
        createdBy: ctx.user!.openId,
      }).$returningId();
      return projectDetail(db, Number(inserted[0]!.id));
    }),

  addEvaluation: qualityOperatorProcedure
    .input(evaluationInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const project = (await db.select().from(rdSensoryProjects).where(eq(rdSensoryProjects.id, input.projectId)).limit(1))[0];
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto de I&D não encontrado." });
      if (project.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "O projeto de I&D está fechado e não aceita novas avaliações." });
      const profile = ctx.operatorProfile!;
      await db.insert(rdSensoryEvaluations).values({
        ...input,
        weightedScore: calculateRDSensoryWeightedScore(input),
        tasterProfileId: input.tasterName === profile.name ? profile.id : null,
        createdByProfileId: profile.id,
        createdByName: profile.name,
        createdBy: ctx.user!.openId,
      });
      return projectDetail(db, input.projectId);
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
});
