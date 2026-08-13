import { readFile, writeFile } from "node:fs/promises";

const file = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/ModuleControl.tsx";
let source = await readFile(file, "utf8");

source = source.replace('import { FragileOperationsPanel } from "@/components/quality/FragileOperationsPanel";', 'import { FragileOperationsPanel } from "@/components/quality/FragileOperationsPanel";\nimport { useControlScope } from "@/contexts/ControlScopeContext";');
source = source.replace("ClipboardCheck, Factory, FilePlus2", "ClipboardCheck, FilePlus2");
source = source.replace('  const factories = metadata.data?.factories ?? [];\n  const [factoryId, setFactoryId] = useState("");', '  const { factoryId } = useControlScope();');

const returnStart = source.indexOf('  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-5xl space-y-6"><Card');
const moduleMarker = source.indexOf('{module === "bphf"', returnStart);
if (returnStart === -1 || moduleMarker === -1) throw new Error("Não foi possível localizar o seletor local de fábrica.");
source = source.slice(0, returnStart) + '  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-5xl space-y-6">' + source.slice(moduleMarker);

await writeFile(file, source, "utf8");
