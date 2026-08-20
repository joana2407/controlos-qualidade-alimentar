import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { MODULES } from "@/lib/quality";
import { OFFLINE_INCIDENCE_EVENT, listOfflineIncidences, queueOfflineIncidence, syncOfflineIncidences, type OfflineIncidenceDraft } from "@/lib/offlineIncidences";
import { trpc } from "@/lib/trpc";
import { CloudOff, CloudUpload, Plus, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const initialDraft = { title: "", description: "", factoryId: "none", area: "", module: "bphf" };

export function OfflineIncidencePanel() {
  const { activeProfile } = useQualityAccess();
  const utils = trpc.useUtils();
  const metadata = trpc.quality.metadata.useQuery();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [pending, setPending] = useState<OfflineIncidenceDraft[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshQueue = useCallback(async () => setPending(await listOfflineIncidences()), []);
  const invalidateOperationalData = () => {
    utils.quality.listIncidences.invalidate();
    utils.quality.incidenceRecurrenceAlerts.invalidate();
    utils.quality.dashboard.invalidate();
  };

  useEffect(() => {
    refreshQueue();
    const refresh = () => { setOnline(navigator.onLine); refreshQueue(); };
    window.addEventListener(OFFLINE_INCIDENCE_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener(OFFLINE_INCIDENCE_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [refreshQueue]);

  const sync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflineIncidences();
      await refreshQueue();
      if (result.synced) {
        invalidateOperationalData();
        toast.success(`${result.synced} incidência${result.synced === 1 ? "" : "s"} sincronizada${result.synced === 1 ? "" : "s"}.`);
      } else if (result.pending) {
        toast.message("As incidências continuam guardadas até existir ligação e sessão ativa.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar as incidências.");
    } finally {
      setIsSyncing(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeProfile) return toast.error("Selecione o perfil e introduza o PIN antes de registar uma incidência.");
    try {
      const result = await queueOfflineIncidence({
        title: draft.title.trim(),
        description: draft.description.trim(),
        factoryId: draft.factoryId === "none" ? null : Number(draft.factoryId),
        area: draft.area.trim(),
        module: draft.module,
        occurredAt: new Date().toISOString(),
        authorProfileId: activeProfile.id,
        authorName: activeProfile.name,
      });
      await refreshQueue();
      setDraft(initialDraft);
      setOpen(false);
      if (result.synced) {
        invalidateOperationalData();
        toast.success("Incidência registada e sincronizada.");
      } else {
        toast.success("Incidência guardada no telemóvel e aguardando sincronização.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar a incidência offline.");
    }
  };

  return <>
    <Card className={`border-0 panel-shadow ${pending.length ? "border border-amber-200" : ""}`}><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`rounded-xl p-3 ${online ? "bg-teal-50 text-teal-700" : "bg-amber-100 text-amber-800"}`}>{online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}</div><div><p className="font-medium">Registo de incidências sem internet</p><p className="mt-1 text-sm text-muted-foreground">{pending.length ? `${pending.length} incidência${pending.length === 1 ? "" : "s"} pendente${pending.length === 1 ? "" : "s"} de sincronização.` : online ? "Ligação disponível. As novas incidências são sincronizadas automaticamente." : "Sem ligação. As novas incidências ficam guardadas no telemóvel."}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={sync} disabled={!pending.length || !online || isSyncing}><CloudUpload className="mr-2 h-4 w-4" />{isSyncing ? "A sincronizar…" : "Sincronizar"}</Button><Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova incidência</Button></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Nova incidência</DialogTitle><DialogDescription>O registo é guardado no telemóvel de imediato. Se estiver sem internet, será sincronizado automaticamente quando a ligação e a sessão PIN estiverem disponíveis.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label>Título</Label><Input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Embalagem danificada na linha" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fábrica / linha</Label><Select value={draft.factoryId} onValueChange={(value) => setDraft((current) => ({ ...current, factoryId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem fábrica/linha</SelectItem>{(metadata.data?.factories ?? []).map((factory) => <SelectItem key={factory.id} value={String(factory.id)}>{factory.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Controlo relacionado</Label><Select value={draft.module} onValueChange={(value) => setDraft((current) => ({ ...current, module: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODULES.map((module) => <SelectItem key={module.id} value={module.id}>{module.label}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label>Área</Label><Input required value={draft.area} onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))} placeholder="Ex.: Produção, embalagem ou logística" /></div><div className="space-y-2"><Label>Descrição da incidência</Label><Textarea required value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Descreva o desvio observado e a ação imediata, se aplicável." rows={5} /></div><div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-2">{online ? <Wifi className="h-4 w-4 text-teal-700" /> : <CloudOff className="h-4 w-4 text-amber-700" />}{online ? "Será sincronizada logo após guardar." : "Será guardada localmente até recuperar ligação."}</span></div><Button className="w-full" type="submit" disabled={!activeProfile}><CloudOff className="mr-2 h-4 w-4" />Guardar incidência</Button></form></DialogContent></Dialog>
  </>;
}
