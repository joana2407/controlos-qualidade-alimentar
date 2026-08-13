import { describe, expect, it } from "vitest";
import { createSessionToken, hashPin, hashSessionToken, validatePin, verifyPin } from "./team-access";

describe("segurança dos PINs operacionais", () => {
  it("aceita PINs numéricos de 4 a 8 algarismos", () => {
    expect(validatePin("4829")).toBe(true);
    expect(validatePin("12345678")).toBe(true);
    expect(validatePin("123")).toBe(false);
    expect(validatePin("12ab")).toBe(false);
  });

  it("verifica o PIN contra o hash sem expor o valor original", () => {
    const hash = hashPin("4829", "fixed-salt-for-test");
    expect(hash).not.toContain("4829");
    expect(verifyPin("4829", hash)).toBe(true);
    expect(verifyPin("9999", hash)).toBe(false);
  });

  it("gera e resume tokens de sessão sem persistir o token em claro", () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
