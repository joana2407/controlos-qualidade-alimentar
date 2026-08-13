import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Boxes, CalendarClock, CheckCircle2, ClipboardCheck, ImagePlus, MapPin, Pencil, Plus } from "lucide-react";
import React, { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type Periodicity = "D" | "S" | "Q" | "M";
const periodLabel: Record<Periodicity, string> = { D: "Diário", S: "Semanal", Q: "Quinzenal", M: "Mensal" };

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function FragileOperationsPanel({ createEntry, factoryId }: { createEntry: any; factoryId: string }) {
  const utils = trpc.useUtils();
  const metadata = trpc.quality.metadata.useQuery();
  const [periodicity, setPeriodicity] = useState<"all" | Periodicity>("all");
  const [area, setArea] = useState("all");
  const [itemId, setItemId] = useState("");
  const [state, setState] = useState("Íntegro");
  const [notes, setNotes] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [editorFactoryId, setEditorFactoryId] = useState("");
  const [editorPeriodicity, setEditorPeriodicity] = useState<Periodicity>("M");
  const [editorType, setEditorType] = useState<"Vidro" | "Plástico rígido" | "Outro">("Outro");

  const queryInput = useMemo(() => factoryId ? { factoryId: Number(factoryId), periodicity: periodicity === "all" ? undefined : periodicity } : undefined, [factoryId, periodicity]);
  const pendingInput = useMemo(() => factoryId ? { factoryId: Number(factoryId) } : undefined, [factoryId]);
  const items = trpc.quality.listFragileItems.useQuery(queryInput, { enabled: Boolean(factoryId) });
  const pending = trpc.quality.fragilePending.useQuery(pendingInput, { enabled: Boolean(factoryId) });
  const addItem = trpc.quality.addFragileItem.useMutation({ onSuccess: () => { utils.quality.listFragileItems.invalidate(); utils.quality.fragilePending.invalidate(); setCreateOpen(false); toast.success("Ponto de controlo criado."); }, onError: (error) => toast.error(error.message) });
  const updateItem = trpc.quality.updateFragileItem.useMutation({ onSuccess: () => { utils.quality.listFragileItems.invalidate(); utils.quality.fragilePending.invalidate(); setEditOpen(false); toast.success("Ponto de controlo atualizado."); }, onError: (error) => toast.error(error.message) });
  const uploadImage = trpc.quality.uploadFragileReferenceImage.useMutation({ onSuccess: () => { utils.quality.listFragileItems.invalidate(); toast.success("Imagem de referência carregada."); }, onError: (error) => toast.error(error.message) });

  const catalog = items.data ?? [];
  const availableAreas = Array.from(new Set(catalog.map((item) => item.location))).sort();
  const visibleItems = catalog.filter((item) => area === "all" || item.location === area);
  const selectedItem = visibleItems.find((item) => String(item.id) === itemId) ?? catalog.find((item) => String(item.id) === itemId);
  const pendingPoints = (pending.data ?? []).filter((item) => periodicity === "all" || item.periodicity === periodicity);
  const pendingCounts = (pending.data ?? []).reduce<Record<Periodicity, number>>((result, item) => { result[item.periodicity] += 1; return result; }, { D: 0, S: 0, Q: 0, M: 0 });
  const factories = metadata.data?.factories ?? [];

  function resetEditor(item?: any) {
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setLocation(item?.location ?? "");
    setEditorFactoryId(String(item?.factoryId ?? factoryId ?? ""));
    setEditorPeriodicity(item?.periodicity ?? "M");
    setEditorType(item?.itemType ?? "Outro");
  }

  function changePeriodicity(value: "all" | Periodicity) { setPeriodicity(value); setArea("all"); setItemId(""); }
  function openEdit(item: any) { resetEditor(item); setEditOpen(true); }
  function openInspection(item: any) { setItemId(String(item.id)); document.getElementById("registo-inspecao-quebraveis")?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }

  function submitNew(event: FormEvent) {
    event.preventDefault();
    if (!editorFactoryId) return toast.error("Selecione a fábrica do novo ponto.");
    addItem.mutate({ name, location, factoryId: Number(editorFactoryId), periodicity: editorPeriodicity, itemType: editorType });
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editorFactoryId) return toast.error("Selecione a fábrica do ponto de controlo.");
    updateItem.mutate({ id: editing.id, name, location, factoryId: Number(editorFactoryId), periodicity: editorPeriodicity, itemType: editorType });
  }

  async function uploadReference(file?: File) {
    if (!file || !editing) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return toast.error("Use uma imagem JPG, PNG ou WEBP.");
    if (file.size > 4_500_000) return toast.error("A imagem deve ter no máximo 4,5 MB.");
    try {
      const dataUrl = await fileAsDataUrl(file);
      uploadImage.mutate({ itemId: editing.id, fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", dataUrl }, { onSuccess: (result) => setEditing((current: any) => current ? { ...current, referenceImageUrl: result.url } : current) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar a imagem."); }
  }

  function submitInspection(event: FormEvent) {
    event.preventDefault();
    if (!factoryId || !selectedItem) return toast.error("Selecione uma fábrica e um ponto de controlo.");
    if (state !== "Íntegro" && !notes.trim()) return toast.error("A ação de contenção é obrigatória em caso de dano ou ausência.");
    createEntry.mutate({ module: "fragile_items", title: `Quebrável — ${selectedItem.name}`, area: selectedItem.location, result: state === "Íntegro" ? "C" : "NC", notes, payload: { fragileItemId: selectedItem.id, state, containmentAction: notes, periodicity: selectedItem.periodicity, referenceImageUrl: selectedItem.referenceImageUrl }, createNonconformity: state !== "Íntegro", severity: state === "Danificado" ? "high" : "medium" });
  }

  const pointForm = (onSubmit: (event: FormEvent) => void, label: string, allowImage = false) => <form onSubmit={onSubmit} className="space-y-4"><div className="space-y-2"><Label>Nome do ponto de controlo</Label><Input required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fábrica / linha</Label><Select value={editorFactoryId} onValueChange={setEditorFactoryId}><SelectTrigger><SelectValue placeholder="Selecione a fábrica" /></SelectTrigger><SelectContent>{factories.map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Área</Label><Input required value={location} onChange={(event) => setLocation(event.target.value)} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Periodicidade</Label><Select value={editorPeriodicity} onValueChange={(value) => setEditorPeriodicity(value as Periodicity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(periodLabel).map(([code, text]) => <SelectItem key={code} value={code}>{code} — {text}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Tipo</Label><Select value={editorType} onValueChange={(value) => setEditorType(value as typeof editorType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Vidro", "Plástico rígido", "Outro"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div></div>{allowImage && <div className="space-y-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-4"><div className="flex items-center gap-2 text-sm font-medium text-teal-900"><ImagePlus className="h-4 w-4" />Imagem de referência</div>{editing?.referenceImageUrl && <img src={editing.referenceImageUrl} alt={`Referência: ${editing.name}`} className="h-32 w-full rounded-lg border border-teal-100 object-cover" />}<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadReference(event.target.files?.[0])} disabled={uploadImage.isPending} /></div>}<Button className="w-full" disabled={addItem.isPending || updateItem.isPending}>{addItem.isPending || updateItem.isPending ? "A guardar…" : label}</Button></form>;

  return <div className="space-y-6"><header className="flex rounded-2xl bg-slate-900 px-6 py-5 text-white"><div className="flex items-center gap-3"><div className="rounded-xl bg-teal-500/15 p-3 text-teal-300"><Boxes className="h-6 w-6" /></div><div><p className="font-mono-ui text-xs uppercase tracking-[0.17em] text-teal-300">Registo operacional</p><h1 className="mt-1 text-2xl font-semibold">Quebráveis</h1></div></div></header><Card className="border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">Controlo de pontos</p><CardTitle className="mt-1 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-teal-700" />Pendências e catálogo</CardTitle><CardDescription className="mt-1">Filtre a periodicidade, registe inspeções e atualize os pontos de controlo da fábrica selecionada.</CardDescription></div><div className="flex gap-2"><Select value={periodicity} onValueChange={(value) => changePeriodicity(value as "all" | Periodicity)}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as periodicidades</SelectItem>{Object.entries(periodLabel).map(([code, text]) => <SelectItem key={code} value={code}>{code} — {text}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => { resetEditor(); setEditorFactoryId(factoryId); setCreateOpen(true); }}><Plus className="mr-2 h-4 w-4" />Adicionar ponto</Button></div></div></CardHeader><CardContent className="space-y-6 p-5">{!factoryId ? <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-muted-foreground">Selecione uma fábrica ou linha no topo para visualizar pendências e gerir os respetivos pontos de controlo.</div> : <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(periodLabel).map(([code, text]) => <div key={code} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="font-mono-ui text-xs text-muted-foreground">{code} · {text}</p><p className="mt-1 text-2xl font-semibold">{pendingCounts[code as Periodicity]}</p><p className="text-xs text-muted-foreground">pendentes</p></div>)}</div><div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><div className="space-y-5"><section><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Inspeções pendentes</h2><p className="text-sm text-muted-foreground">Pontos sem registo no ciclo aplicável.</p></div><Badge className="bg-teal-700 text-white hover:bg-teal-700">{pendingPoints.length} pendentes</Badge></div>{pending.isLoading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">A calcular pendências…</p> : pendingPoints.length ? <div className="divide-y rounded-xl border border-slate-100">{pendingPoints.map((point) => <div key={point.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{point.name}</p><Badge variant="outline">{point.periodicity} — {periodLabel[point.periodicity]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{point.location} · {point.lastInspectionAt ? `Última inspeção: ${new Date(point.lastInspectionAt).toLocaleDateString("pt-PT")}` : "Sem inspeções registadas"}</p></div><Button size="sm" onClick={() => openInspection(point)}><ClipboardCheck className="mr-2 h-4 w-4" />Inspecionar</Button></div>)}</div> : <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mr-2 inline h-4 w-4" />Não existem pendências para os filtros selecionados.</div>}</section><section><div className="mb-3"><h2 className="font-semibold">Catálogo de pontos</h2><p className="text-sm text-muted-foreground">Selecione uma área, consulte a referência e edite o ponto quando necessário.</p></div><Select value={area} onValueChange={(value) => { setArea(value); setItemId(""); }}><SelectTrigger className="mb-3 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as áreas</SelectItem>{availableAreas.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><div className="max-h-80 divide-y overflow-y-auto rounded-xl border border-slate-100">{visibleItems.map((item) => <div key={item.id} className="flex items-center gap-3 p-3"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-teal-50 text-teal-700">{item.referenceImageUrl ? <img src={item.referenceImageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="m-2.5 h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.location} · {item.periodicity} — {periodLabel[item.periodicity]}</p></div><Button size="icon" variant="outline" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></div>)}{!visibleItems.length && <p className="p-4 text-sm text-muted-foreground">Não existem pontos com estes filtros.</p>}</div></section></div><form id="registo-inspecao-quebraveis" onSubmit={submitInspection} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5"><div className="mb-5 flex items-center gap-2"><MapPin className="h-5 w-5 text-teal-700" /><div><h2 className="font-semibold">Registar inspeção</h2><p className="text-sm text-muted-foreground">O ponto selecionado transporta automaticamente a área e a periodicidade.</p></div></div><div className="space-y-4"><div className="space-y-2"><Label>Ponto de controlo</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger><SelectValue placeholder="Selecione o ponto" /></SelectTrigger><SelectContent>{visibleItems.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {item.periodicity}</SelectItem>)}</SelectContent></Select></div>{selectedItem && <div className="space-y-3 rounded-xl border border-teal-100 bg-white p-4">{selectedItem.referenceImageUrl && <img src={selectedItem.referenceImageUrl} alt={`Referência de ${selectedItem.name}`} className="h-28 w-full rounded-lg object-cover" />}<div className="flex flex-wrap gap-2"><Badge variant="outline">{selectedItem.itemType}</Badge><Badge className="bg-slate-900 text-white hover:bg-slate-900">{selectedItem.periodicity} — {periodLabel[selectedItem.periodicity]}</Badge><span className="text-sm text-muted-foreground">{selectedItem.location}</span></div></div>}<div className="space-y-2"><Label>Estado da inspeção</Label><Select value={state} onValueChange={setState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Íntegro", "Danificado", "Em falta"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Ação de contenção / observações</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} required={state !== "Íntegro"} placeholder="Obrigatório em caso de item danificado ou em falta." /></div><Button className="w-full" size="lg" variant={state === "Íntegro" ? "default" : "destructive"} disabled={!selectedItem}>Registar inspeção</Button></div></form></div></>}</CardContent></Card><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Adicionar ponto de controlo</DialogTitle><DialogDescription>Crie um ponto para a fábrica, área e periodicidade necessárias.</DialogDescription></DialogHeader>{pointForm(submitNew, "Criar ponto")}</DialogContent></Dialog><Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar ponto de controlo</DialogTitle><DialogDescription>Atualize o ponto e associe uma imagem de referência opcional.</DialogDescription></DialogHeader>{pointForm(submitEdit, "Guardar alterações", true)}</DialogContent></Dialog></div>;
}
