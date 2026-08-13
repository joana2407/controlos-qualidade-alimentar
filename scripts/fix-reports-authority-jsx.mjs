import { readFile, writeFile } from "node:fs/promises";

const path = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/Reports.tsx";
const source = await readFile(path, "utf8");
const start = source.indexOf("Não existem incidências registadas para esta data e fábrica ou linha.");
const marker = "</CardContent></Card><div className=\"grid gap-6 xl:grid-cols-[1.2fr_0.8fr]\">";
const markerIndex = source.indexOf(marker, start);
if (start < 0 || markerIndex < 0) throw new Error("A secção de incidências diárias não foi localizada.");
const before = source.slice(0, markerIndex);
const after = source.slice(markerIndex);
await writeFile(path, `${before}</div>${after}`);
