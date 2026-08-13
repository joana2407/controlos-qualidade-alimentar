import { readFile, writeFile } from "node:fs/promises";

const file = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/ModuleControl.tsx";
let source = await readFile(file, "utf8");
const replacements = [
  ['<Label>Produto</Label><Input required value={product}', '<Label htmlFor="shelf-life-product">Produto</Label><Input id="shelf-life-product" required value={product}'],
  ['<Label>Lote</Label><Input required value={lot}', '<Label htmlFor="shelf-life-lot">Lote</Label><Input id="shelf-life-lot" required value={lot}'],
  ['<Label>Validade</Label><Input required type="date" value={validity}', '<Label htmlFor="shelf-life-validity">Validade</Label><Input id="shelf-life-validity" required type="date" value={validity}'],
  ['<Label>Motivo / observações da NC</Label><Textarea required value={reason}', '<Label htmlFor="shelf-life-reason">Motivo / observações da NC</Label><Textarea id="shelf-life-reason" required value={reason}'],
];
for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`Campo shelf-life não encontrado: ${from}`);
  source = source.replace(from, to);
}
await writeFile(file, source, "utf8");
