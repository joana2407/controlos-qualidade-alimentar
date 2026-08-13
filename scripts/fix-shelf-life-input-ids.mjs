import { readFile, writeFile } from "node:fs/promises";

const file = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/ModuleControl.tsx";
let source = await readFile(file, "utf8");
const shelfStart = source.indexOf("export function ShelfLife(");
const shelfEnd = source.indexOf("function MonthlyChecklist", shelfStart);
if (shelfStart === -1 || shelfEnd === -1) throw new Error("Componente shelf-life não localizado.");

let before = source.slice(0, shelfStart)
  .replace('<Label htmlFor="shelf-life-product">Produto</Label><Input id="shelf-life-product" required value={product}', '<Label>Produto</Label><Input required value={product}')
  .replace('<Label htmlFor="shelf-life-lot">Lote</Label><Input id="shelf-life-lot" required value={lot}', '<Label>Lote</Label><Input required value={lot}');
let shelf = source.slice(shelfStart, shelfEnd)
  .replace('<Label>Produto</Label><Input required value={product}', '<Label htmlFor="shelf-life-product">Produto</Label><Input id="shelf-life-product" required value={product}')
  .replace('<Label>Lote</Label><Input required value={lot}', '<Label htmlFor="shelf-life-lot">Lote</Label><Input id="shelf-life-lot" required value={lot}');

source = before + shelf + source.slice(shelfEnd);
await writeFile(file, source, "utf8");
