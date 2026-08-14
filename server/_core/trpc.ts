import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireQualitySession = t.middleware(async ({ ctx, next }) => {
  if (!ctx.operatorProfile) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Selecione o perfil operacional e introduza o respetivo PIN." });
  }
  const now = new Date();
  const operationalUser = ctx.user ?? {
    id: 0,
    openId: `quality-pin-${ctx.operatorProfile.id}`,
    name: ctx.operatorProfile.name,
    email: null,
    loginMethod: "quality-pin",
    role: ctx.operatorProfile.role === "manager" ? "admin" as const : "user" as const,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return next({ ctx: { ...ctx, user: operationalUser, operatorProfile: ctx.operatorProfile } });
});

export const qualitySessionProcedure = t.procedure.use(requireQualitySession);

export const qualityOperatorProcedure = qualitySessionProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    return next({ ctx: { ...ctx, operatorProfile: ctx.operatorProfile } });
  }),
);

export const qualityManagerProcedure = qualitySessionProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (ctx.operatorProfile?.role !== "manager") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas a Responsável de Qualidade pode executar esta ação." });
    }
    return next({ ctx: { ...ctx, operatorProfile: ctx.operatorProfile } });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
