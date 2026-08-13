import { readFile, writeFile } from "node:fs/promises";

const file = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/ModuleControl.tsx";
let source = await readFile(file, "utf8");
const start = source.indexOf("function ShelfLife(");
const end = source.indexOf("function MonthlyChecklist", start);
if (start === -1 || end === -1) throw new Error("Não foi possível localizar o componente shelf-life.");

const replacement = `function ShelfLife({ createEntry }: any) {
  const [result, setResult] = useState<"C" | "NC">("C");
  const [product, setProduct] = useState("");
  const [lot, setLot] = useState("");
  const [validity, setValidity] = useState("");
  const [reason, setReason] = useState("");
  const isNcComplete = Boolean(product.trim() && lot.trim() && validity && reason.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (result === "NC" && !isNcComplete) return toast.error("Em caso de NC, identifique o produto, lote, validade e motivo da incidência.");
    createEntry.mutate({
      module: "shelf_life",
      title: result === "NC" ? \`Incidência shelf-life — \${product}\` : "Shelf-life — Conforme",
      area: "Shelf-life",
      result,
      notes: result === "NC" ? reason : undefined,
      payload: {
        observationResult: result,
        product: result === "NC" ? product : null,
        lot: result === "NC" ? lot : null,
        validity: result === "NC" ? validity : null,
        reason: result === "NC" ? reason : null,
        dailyIncidenceGenerated: result === "NC",
      },
      createNonconformity: result === "NC",
      severity: "medium",
    });
  }

  return <><ModuleHeader label="Controlo de amostras em shelf-life" description="Registe a verificação diária como C ou NC. Os dados de rastreabilidade surgem apenas quando existe uma incidência." icon={PackageSearch} /><form onSubmit={submit} className="space-y-5"><Card className="border-0 panel-shadow"><CardContent className="space-y-5 p-6"><div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4"><p className="font-medium text-teal-950">Verificação diária da amostra</p><p className="mt-1 text-sm text-teal-800">Registe primeiro o resultado. Um NC cria automaticamente a incidência do dia para tratamento.</p></div><div className="space-y-2"><Label>Resultado da verificação</Label><BinaryResultPicker value={result} onChange={setResult} /></div>{result === "NC" && <div className="space-y-5 rounded-2xl border border-red-200 bg-red-50/60 p-5"><div><p className="font-semibold text-red-950">Detalhe da incidência</p><p className="mt-1 text-sm text-red-800">Estes dados são obrigatórios para garantir a rastreabilidade da não conformidade.</p></div><div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>Produto</Label><Input required value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Produto da amostra" /></div><div className="space-y-2"><Label>Lote</Label><Input required value={lot} onChange={(event) => setLot(event.target.value)} placeholder="Lote" /></div><div className="space-y-2"><Label>Validade</Label><Input required type="date" value={validity} onChange={(event) => setValidity(event.target.value)} /></div></div><div className="space-y-2"><Label>Motivo / observações da NC</Label><Textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descreva o desvio observado na amostra." /></div></div>}<Button size="lg" className="w-full" variant={result === "NC" ? "destructive" : "default"} disabled={createEntry.isPending || (result === "NC" && !isNcComplete)}>{result === "NC" ? "Registar NC e criar incidência" : "Registar verificação conforme"}</Button></CardContent></Card></form></>;
}

`;

source = source.slice(0, start) + replacement + source.slice(end);
await writeFile(file, source, "utf8");
