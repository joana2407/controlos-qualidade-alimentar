import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const QUALITY_OPERATOR_COOKIE = "quality_operator_session";
export const QUALITY_SESSION_HOURS = 10;

export const QUALITY_TEAM_DEFAULTS = [
  { code: "SABRINA_ESTEVES", name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" as const },
  { code: "NEUZA_ANTUNES", name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" as const },
  { code: "JOANA_PINA", name: "Joana Pina", title: "Resp. Qualidade", role: "manager" as const },
  { code: "GESTAO", name: "Gestão", title: "Consulta", role: "viewer" as const },
] as const;

export function validatePin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  if (!validatePin(pin)) throw new Error("O PIN deve ter entre 4 e 8 algarismos.");
  const derived = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, stored: string | null | undefined) {
  if (!stored || !validatePin(pin)) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const received = scryptSync(pin, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
