import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { and, eq, gt } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { qualityPinProfiles, qualityPinSessions, type User } from "../../drizzle/schema";
import { getDb } from "../db";
import { hashSessionToken, QUALITY_OPERATOR_COOKIE } from "../team-access";
import { sdk } from "./sdk";

export type QualityOperator = {
  id: number;
  name: string;
  title: string;
  role: "technician" | "manager" | "viewer";
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  operatorProfile: QualityOperator | null;
};

export async function createContext(
  opts: Pick<CreateExpressContextOptions, "req" | "res">
): Promise<TrpcContext> {
  let user: User | null = null;
  let operatorProfile: QualityOperator | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  try {
    const token = parseCookie(opts.req.headers.cookie ?? "")[QUALITY_OPERATOR_COOKIE];
    const db = await getDb();
    if (token && db) {
      const sessionConditions = [
        eq(qualityPinSessions.tokenHash, hashSessionToken(token)),
        gt(qualityPinSessions.expiresAt, new Date()),
        eq(qualityPinSessions.oauthOpenId, user?.openId ?? "pin-only"),
      ];
      const session = (await db.select().from(qualityPinSessions).where(and(...sessionConditions)).limit(1))[0];
      if (session) {
        const profile = (await db.select().from(qualityPinProfiles).where(eq(qualityPinProfiles.id, session.profileId)).limit(1))[0];
        if (profile?.active === "true") operatorProfile = { id: profile.id, name: profile.name, title: profile.title, role: profile.role };
      }
    }
  } catch (error) {
    operatorProfile = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    operatorProfile,
  };
}
