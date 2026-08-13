import { readFile, writeFile } from "node:fs/promises";

const file = "/home/ubuntu/controlos-qualidade-alimentar/client/src/components/quality/FragileOperationsPanel.tsx";
let source = await readFile(file, "utf8");

source = source.replaceAll(" style={{display: 'flex'}}", "");
source = source.replace(
  '<header className="rounded-2xl bg-slate-900 px-6 py-5 text-white">',
  '<header className="flex rounded-2xl bg-slate-900 px-6 py-5 text-white">',
);
source = source.replace(
  '<p className="mt-1 text-sm text-slate-300"></p>',
  "",
);
source = source.replace(
  "Filtre a periodicidade, registe inspeções e atualize os pontos de controlo da fábrica selecionada no mesmo painel.",
  "Filtre a periodicidade, registe inspeções e atualize os pontos de controlo da fábrica selecionada.",
);

await writeFile(file, source, "utf8");
