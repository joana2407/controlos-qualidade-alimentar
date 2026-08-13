// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CONTROL_FACTORY_SCOPE_STORAGE_KEY, readControlFactoryScope, writeControlFactoryScope } from "../client/src/lib/controlFactoryScope";

describe("persistência de fábrica ou linha nos controlos", () => {
  beforeEach(() => window.localStorage.clear());

  it("guarda e recupera a seleção entre navegações", () => {
    writeControlFactoryScope("3");
    expect(window.localStorage.getItem(CONTROL_FACTORY_SCOPE_STORAGE_KEY)).toBe("3");
    expect(readControlFactoryScope()).toBe("3");
  });

  it("remove o contexto quando não existe seleção ativa", () => {
    writeControlFactoryScope("2");
    writeControlFactoryScope("");
    expect(readControlFactoryScope()).toBe("");
  });
});
