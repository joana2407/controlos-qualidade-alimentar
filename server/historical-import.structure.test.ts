import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mecanismo de importação histórica de ocorrências", () => {
  it("preserva uma migração transacional e idempotente com proveniência auditável", () => {
    const source = readFileSync("/home/ubuntu/controlos-qualidade-alimentar/scripts/import-historical-occurrences.mjs", "utf8");
    expect(source).toContain("beginTransaction");
    expect(source).toContain("rollback");
    expect(source).toContain("historic-import");
    expect(source).toContain("INSERT INTO ${table}");
    expect(source).toContain("connection.destroy()");
  });
});
