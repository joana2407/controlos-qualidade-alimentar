import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Boxes, CalendarClock, CheckCircle2, ClipboardCheck, ImagePlus, MapPin, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Periodicity = "D" | "S" | "Q" | "M";
type EvidencePhoto = { url: string; key: string; fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };
type FragilePoint = {
  id: number;
  name: string;
  location: string;
  factoryId: number | null;
  periodicity: Periodicity;
  itemType: "Vidro" | "Plástico rígido" | "Outro";
  referenceImageUrl?: string | null;
  lastInspectionAt?: Date | string | null;
  dueAt?: Date | string;
  delayDays?: number;
  createdByName?: string | null;
  updatedByName?: string | null;
};

const periodLabel: Record<Periodicity, string> = { D: "Diário", S: "Semanal", Q: "Quinzenal", M: "Mensal" };

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function delayLabel(point: FragilePoint) {
  if (!point.delayDays) return "Vence hoje";
  return `Atraso: ${point.delayDays} ${point.delayDays === 1 ? "dia" : "dias"}`;
}

export function FragileOperationsPanel({ createEntry, factoryId, showHeader = true }: { createEntry: any; factoryId: string; showHeader?: boolean }) {
  const utils = trpc.useUtils();
  const metadata = trpc.quality.metadata.useQuery();
  const [periodicity, setPeriodicity] = useState<"all" | Periodicity>("all");
  const [area, setArea] = useState("all");
  const [catalogFactoryId, setCatalogFactoryId] = useState(factoryId || "all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [state, setState] = useState("Íntegro");
  const [notes, setNotes] = useState("");
  const [damagePhotos, setDamagePhotos] = useState<EvidencePhoto[]>([]);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<FragilePoint | null>(null);
  const [deleting, setDeleting] = useState<FragilePoint | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [editorFactoryId, setEditorFactoryId] = useState("");
  const [editorPeriodicity, setEditorPeriodicity] = useState<Periodicity>("M");
  const [editorType, setEditorType] = useState<FragilePoint["itemType"]>("Outro");

  const pendingInput = useMemo(() => factoryId ? { factoryId: Number(factoryId) } : undefined, [factoryId]);
  const items = trpc.quality.listFragileItems.useQuery();
  const pending = trpc.quality.fragilePending.useQuery(pendingInput, { enabled: Boolean(factoryId) });
  const factories = metadata.data?.factories ?? [];
  const catalog = (items.data ?? []) as FragilePoint[];
  const pendingAll = (pending.data ?? []) as FragilePoint[];
  const catalogForFactory = catalog.filter((item) => catalogFactoryId === "all" || String(item.factoryId) === catalogFactoryId);
  const availableAreas = Array.from(new Set(catalogForFactory.map((item) => item.location))).sort();
  const searchTerm = catalogSearch.trim().toLocaleLowerCase("pt-PT");
  const visibleItems = catalogForFactory.filter((item) =>
    (area === "all" || item.location === area) && (!searchTerm || item.name.toLocaleLowerCase("pt-PT").includes(searchTerm)),
  );
  const pendingPoints = pendingAll.filter((item) => periodicity === "all" || item.periodicity === periodicity);
  const pendingCounts = pendingAll.reduce<Record<Periodicity, number>>((result, item) => {
    result[item.periodicity] += 1;
    return result;
  }, { D: 0, S: 0, Q: 0, M: 0 });
  const selectedItem = catalog.find((item) => String(item.id) === itemId);

  const refreshFragile = () => {
    utils.quality.listFragileItems.invalidate();
    utils.quality.fragilePending.invalidate();
  };
  const addItem = trpc.quality.addFragileItem.useMutation({ onSuccess: () => { refreshFragile(); setCreateOpen(false); toast.success("Ponto de controlo criado."); }, onError: (error) => toast.error(error.message) });
  const updateItem = trpc.quality.updateFragileItem.useMutation({ onSuccess: () => { refreshFragile(); setEditOpen(false); toast.success("Ponto de controlo atualizado."); }, onError: (error) => toast.error(error.message) });
  const deleteItem = trpc.quality.deleteFragileItem.useMutation({ onSuccess: () => { refreshFragile(); setDeleteOpen(false); setDeleting(null); toast.success("Ponto de controlo eliminado."); }, onError: (error) => toast.error(error.message) });
  const uploadImage = trpc.quality.uploadFragileReferenceImage.useMutation({ onSuccess: () => { utils.quality.listFragileItems.invalidate(); toast.success("Imagem de referência carregada."); }, onError: (error) => toast.error(error.message) });
  const uploadDamageEvidence = trpc.quality.uploadFragileInspectionEvidence.useMutation({ onError: (error) => toast.error(error.message) });

  useEffect(() => { setCatalogFactoryId(factoryId || "all"); setArea("all"); setCatalogSearch(""); }, [factoryId]);

  function resetEditor(item?: FragilePoint) {
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setLocation(item?.location ?? "");
    setEditorFactoryId(String(item?.factoryId ?? factoryId ?? ""));
    setEditorPeriodicity(item?.periodicity ?? "M");
    setEditorType(item?.itemType ?? "Outro");
  }

  function openInspection(item: FragilePoint) {
    setItemId(String(item.id));
    setState("Íntegro");
    setNotes("");
    setDamagePhotos([]);
    setInspectionOpen(true);
  }
  function openEdit(item: FragilePoint) { resetEditor(item); setCatalogOpen(false); setEditOpen(true); }
  function requestDelete(item: FragilePoint) { setDeleting(item); setCatalogOpen(false); setDeleteOpen(true); }

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
      uploadImage.mutate({ itemId: editing.id, fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", dataUrl }, { onSuccess: (result) => setEditing((current) => current ? { ...current, referenceImageUrl: result.url } : current) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar a imagem."); }
  }
  async function uploadDamagePhoto(file?: File) {
    if (!file || !selectedItem) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return toast.error("Use uma imagem JPG, PNG ou WEBP.");
    if (file.size > 4_500_000) return toast.error("A imagem deve ter no máximo 4,5 MB.");
    try {
      const dataUrl = await fileAsDataUrl(file);
      uploadDamageEvidence.mutate({ itemId: selectedItem.id, fileName: file.name, mimeType: file.type as EvidencePhoto["mimeType"], dataUrl }, { onSuccess: (result) => { setDamagePhotos((photos) => [...photos, result]); toast.success("Fotografia de dano adicionada."); } });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar a fotografia."); }
  }
  function submitInspection(event: FormEvent) {
    event.preventDefault();
    if (!factoryId || !selectedItem) return toast.error("Selecione uma pendência para inspecionar.");
    if (state !== "Íntegro" && !notes.trim()) return toast.error("A ação de contenção é obrigatória em caso de dano ou ausência.");
    if (uploadDamageEvidence.isPending) return toast.error("Aguarde pelo carregamento da fotografia antes de registar a inspeção.");
    createEntry.mutate({ module: "fragile_items", title: `Quebrável — ${selectedItem.name}`, area: selectedItem.location, result: state === "Íntegro" ? "C" : "NC", notes, payload: { fragileItemId: selectedItem.id, state, containmentAction: notes, periodicity: selectedItem.periodicity, referenceImageUrl: selectedItem.referenceImageUrl, evidencePhotos: damagePhotos }, createNonconformity: false, severity: state === "Danificado" ? "high" : "medium" });
    setInspectionOpen(false);
  }

  const pointForm = (onSubmit: (event: FormEvent) => void, label: string, allowImage = false) => <form onSubmit={onSubmit} className="space-y-4">
    <div className="space-y-2"><Label>Nome do ponto de controlo</Label><Input required value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fábrica / linha</Label><Select value={editorFactoryId} onValueChange={setEditorFactoryId}><SelectTrigger><SelectValue placeholder="Selecione a fábrica" /></SelectTrigger><SelectContent>{factories.map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Área</Label><Input required value={location} onChange={(event) => setLocation(event.target.value)} /></div></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Periodicidade</Label><Select value={editorPeriodicity} onValueChange={(value) => setEditorPeriodicity(value as Periodicity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(periodLabel).map(([code, text]) => <SelectItem key={code} value={code}>{code} — {text}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Tipo</Label><Select value={editorType} onValueChange={(value) => setEditorType(value as FragilePoint["itemType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Vidro", "Plástico rígido", "Outro"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div></div>
    {allowImage && <div className="space-y-3 rounded-xl border border-dashed border-teal-200 bg-teal-50/60 p-4"><div className="flex items-center gap-2 text-sm font-medium text-teal-900"><ImagePlus className="h-4 w-4" />Imagem de referência</div>{editing?.referenceImageUrl && <img src={editing.referenceImageUrl} alt={`Referência: ${editing.name}`} className="h-32 w-full rounded-lg border border-teal-100 object-cover" />}<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadReference(event.target.files?.[0])} disabled={uploadImage.isPending} /></div>}
    <Button className="w-full" disabled={addItem.isPending || updateItem.isPending}>{addItem.isPending || updateItem.isPending ? "A guardar…" : label}</Button>
  </form>;

  return <div className="space-y-6">
    {showHeader && <header className="flex rounded-2xl bg-slate-900 px-6 py-5 text-white"><div className="flex items-center gap-3"><div className="rounded-xl bg-teal-500/15 p-3 text-teal-300"><Boxes className="h-6 w-6" /></div><div><p className="font-mono-ui text-xs uppercase tracking-[0.17em] text-teal-300">Registo operacional</p><h1 className="mt-1 text-2xl font-semibold">Quebráveis</h1></div></div></header>}
    <Card className="border-0 panel-shadow">
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono-ui text-[11px] uppercase tracking-[0.16em] text-teal-700">Operação diária</p><CardTitle className="mt-1 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-teal-700" />Inspeções pendentes</CardTitle><CardDescription className="mt-1">Pontos diários vencem em dias úteis; pontos S, Q e M são verificados à sexta-feira.</CardDescription></div><Button variant="outline" onClick={() => { setCatalogFactoryId(factoryId || "all"); setArea("all"); setCatalogSearch(""); setCatalogOpen(true); }}><SlidersHorizontal className="mr-2 h-4 w-4" />Gerir pontos</Button></div></CardHeader>
      <CardContent className="space-y-6 p-5">
        {!factoryId ? <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-muted-foreground">Selecione uma fábrica ou linha no topo para visualizar e inspecionar os respetivos pontos de controlo.</div> : <>
          <div className="flex flex-wrap gap-2" aria-label="Filtro de periodicidade">{(["all", "D", "S", "Q", "M"] as const).map((code) => <Button key={code} type="button" variant={periodicity === code ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setPeriodicity(code)}><span>{code === "all" ? "Todas" : `${code} · ${periodLabel[code]}`}</span><Badge variant="secondary" className="h-5 min-w-5 justify-center px-1 text-[10px]">{code === "all" ? pendingAll.length : pendingCounts[code]}</Badge></Button>)}</div>
          <section><div className="mb-3 flex items-center justify-between"><p className="text-sm text-muted-foreground">{periodicity === "all" ? "Pontos sem registo no ciclo aplicável." : `Pendências ${periodLabel[periodicity].toLowerCase()}.`}</p><Badge className="bg-teal-700 text-white hover:bg-teal-700">{pendingPoints.length} pendentes</Badge></div>{pending.isLoading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">A calcular pendências…</p> : pendingPoints.length ? <div className="divide-y rounded-xl border border-slate-100">{pendingPoints.map((point) => <div key={point.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{point.name}</p><Badge variant="outline">{point.periodicity} — {periodLabel[point.periodicity]}</Badge><Badge variant={point.delayDays ? "destructive" : "secondary"}>{delayLabel(point)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{point.location} · {point.lastInspectionAt ? `Última inspeção: ${new Date(point.lastInspectionAt).toLocaleDateString("pt-PT")}` : "Sem inspeções registadas"}</p></div><Button size="sm" onClick={() => openInspection(point)}><ClipboardCheck className="mr-2 h-4 w-4" />Inspecionar</Button></div>)}</div> : <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mr-2 inline h-4 w-4" />Não existem pendências para este filtro.</div>}</section>
        </>}
      </CardContent>
    </Card>
    <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Registar inspeção</DialogTitle><DialogDescription>{selectedItem ? `Verificação de ${selectedItem.name}.` : "Selecione uma pendência para iniciar a verificação."}</DialogDescription></DialogHeader>{selectedItem && <form onSubmit={submitInspection} className="space-y-4"><div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/50 p-4">{selectedItem.referenceImageUrl && <img src={selectedItem.referenceImageUrl} alt={`Referência de ${selectedItem.name}`} className="h-32 w-full rounded-lg object-cover" />}<div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /><div><p className="font-medium">{selectedItem.name}</p><p className="mt-1 text-sm text-muted-foreground">{selectedItem.location}</p></div></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{selectedItem.itemType}</Badge><Badge className="bg-slate-900 text-white hover:bg-slate-900">{selectedItem.periodicity} — {periodLabel[selectedItem.periodicity]}</Badge></div></div><div className="space-y-2"><Label>Estado da inspeção</Label><Select value={state} onValueChange={setState}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Íntegro", "Danificado", "Em falta"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>{state === "Danificado" && <div className="space-y-3 rounded-xl border border-dashed border-red-200 bg-red-50/60 p-4"><div><Label htmlFor="fragile-damage-photo">Fotografia do dano</Label><p className="mt-1 text-xs leading-5 text-red-900">Anexe uma ou mais fotografias para documentar o item danificado. Formatos JPG, PNG ou WEBP até 4,5 MB.</p></div><Input id="fragile-damage-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadDamagePhoto(event.target.files?.[0])} disabled={uploadDamageEvidence.isPending} />{damagePhotos.length > 0 && <div className="grid grid-cols-2 gap-2">{damagePhotos.map((photo) => <img key={photo.url} src={photo.url} alt={`Evidência de dano: ${photo.fileName}`} className="h-24 w-full rounded-lg border border-red-100 object-cover" />)}</div>}</div>}<div className="space-y-2"><Label>Ação de contenção / observações</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} required={state !== "Íntegro"} placeholder="Obrigatório em caso de item danificado ou em falta." /></div><Button className="w-full" size="lg" variant={state === "Íntegro" ? "default" : "destructive"}>Registar inspeção</Button></form>}</DialogContent></Dialog>
    <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Gerir pontos de controlo</DialogTitle><DialogDescription>Pesquise por nome, filtre a fábrica e a área, ou crie e edite pontos de controlo. As alterações ficam associadas ao utilizador que as efetuou.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label>Fábrica / linha</Label><Select value={catalogFactoryId} onValueChange={(value) => { setCatalogFactoryId(value); setArea("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as fábricas e linhas</SelectItem>{factories.map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Área</Label><Select value={area} onValueChange={setArea}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as áreas</SelectItem>{availableAreas.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><Button className="self-end" onClick={() => { setCatalogOpen(false); resetEditor(); setEditorFactoryId(catalogFactoryId === "all" ? factoryId : catalogFactoryId); setCreateOpen(true); }}><Plus className="mr-2 h-4 w-4" />Adicionar ponto</Button></div><div className="mt-3 space-y-2"><Label htmlFor="fragile-search">Pesquisar por nome</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="fragile-search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} className="pl-9" placeholder="Ex.: Janelas, espátulas, extintor…" /></div></div><div className="mt-4 max-h-96 divide-y overflow-y-auto rounded-xl border border-slate-100">{visibleItems.map((item) => <div key={item.id} className="flex items-center gap-3 p-3"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-teal-50 text-teal-700">{item.referenceImageUrl ? <img src={item.referenceImageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="m-2.5 h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.location} · {item.periodicity} — {periodLabel[item.periodicity]}</p>{(item.updatedByName ?? item.createdByName) && <p className="mt-1 truncate text-[11px] text-slate-500">{item.updatedByName ? `Última alteração: ${item.updatedByName}` : `Criado por: ${item.createdByName}`}</p>}</div><div className="flex gap-1"><Button size="icon" variant="outline" aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" aria-label={`Eliminar ${item.name}`} onClick={() => requestDelete(item)}><Trash2 className="h-4 w-4" /></Button></div></div>)}{!visibleItems.length && <p className="p-4 text-sm text-muted-foreground">Não existem pontos com estes filtros ou pesquisa.</p>}</div></DialogContent></Dialog>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Adicionar ponto de controlo</DialogTitle><DialogDescription>Crie um ponto para a fábrica, área e periodicidade necessárias.</DialogDescription></DialogHeader>{pointForm(submitNew, "Criar ponto")}</DialogContent></Dialog>
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar ponto de controlo</DialogTitle><DialogDescription>Atualize o ponto e associe uma imagem de referência opcional.</DialogDescription></DialogHeader>{pointForm(submitEdit, "Guardar alterações", true)}</DialogContent></Dialog>
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Eliminar ponto de controlo</DialogTitle><DialogDescription>{deleting ? `Pretende eliminar «${deleting.name}»? O ponto deixará de surgir nas pendências futuras.` : ""}</DialogDescription></DialogHeader><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={!deleting || deleteItem.isPending} onClick={() => deleting && deleteItem.mutate({ id: deleting.id })}>{deleteItem.isPending ? "A eliminar…" : "Eliminar ponto"}</Button></div></DialogContent></Dialog>
  </div>;
}
