import { afterEach, describe, expect, it, vi } from "vitest";

describe("invokeLLM", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("envia max_completion_tokens para modelos GPT-5", async () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "{}" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await import("./_core/llm");

    await invokeLLM({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Responde em JSON." }],
      maxTokens: 1200,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(payload.max_completion_tokens).toBe(1200);
    expect(payload.max_tokens).toBeUndefined();
  });

  it("mantém max_tokens para modelos que não são GPT-5", async () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await import("./_core/llm");

    await invokeLLM({
      model: "gemini-3-flash-preview",
      messages: [{ role: "user", content: "Responde." }],
      maxTokens: 400,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(payload.max_tokens).toBe(400);
    expect(payload.max_completion_tokens).toBeUndefined();
  });

  it("rejeita uma resposta do Forge sem choices com erro controlado", async () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "resposta incompleta" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const { invokeLLM } = await import("./_core/llm");

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "Responde." }] })
    ).rejects.toThrow("LLM response did not contain any choices");
  });
});
