import { eq } from "drizzle-orm";
import { fragileItems, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import type { TrpcContext } from "../server/_core/context";
import { qualityRouter } from "../server/routers/quality";

const marker = `VALIDACAO-QUEBRAVEIS-${Date.now()}`;
let itemId: number | null = null;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível.");
  const user = (await db.select().from(users).limit(1))[0];
  if (!user) throw new Error("Utilizador de validação indisponível.");

  const ctx: TrpcContext = {
    user,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  const caller = qualityRouter.createCaller(ctx);
  await caller.addFragileItem({ name: marker, location: "Validação técnica", factoryId: 1, periodicity: "M", itemType: "Outro" });
  const created = (await caller.listFragileItems({ factoryId: 1 })).find((item) => item.name === marker);
  if (!created) throw new Error("O ponto criado não foi persistido.");
  itemId = created.id;

  await caller.updateFragileItem({ id: itemId, name: `${marker}-EDITADO`, location: "Validação técnica editada", factoryId: 2, periodicity: "S", itemType: "Plástico rígido" });
  const pixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLk6wAAAABJRU5ErkJggg==";
  await caller.uploadFragileReferenceImage({ itemId, fileName: "validacao.png", mimeType: "image/png", dataUrl: pixelPng });

  const validated = (await caller.listFragileItems({ factoryId: 2, periodicity: "S" })).find((item) => item.id === itemId);
  if (!validated || validated.name !== `${marker}-EDITADO` || validated.location !== "Validação técnica editada" || !validated.referenceImageUrl) {
    throw new Error("A edição ou a imagem de referência não foram persistidas corretamente.");
  }
  console.log(JSON.stringify({ created: true, edited: true, imageAttached: true, itemId }, null, 2));
}

void (async () => {
  let exitCode = 0;
  try {
    await main();
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    if (itemId) {
      const db = await getDb();
      await db?.delete(fragileItems).where(eq(fragileItems.id, itemId));
    }
  }
  process.exit(exitCode);
})();
