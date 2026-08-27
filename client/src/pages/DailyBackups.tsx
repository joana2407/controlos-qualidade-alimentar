import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { dateFormat } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { Archive, Download, FileSpreadsheet, FolderArchive, RefreshCw } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

function fileSize(value: number | null | undefined) {
  if (!value) return "—";
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DailyBackups() {
  const { canManage } = useQualityAccess();
  const utils = trpc.useUtils();
  const history = trpc.quality.dailyReportArchiveHistory.useQuery();
  const [query, setQuery] = useState("");
  const generateBackup = trpc.quality.generateDailyReportArchiveBackup.useMutation({
    onSuccess: (result) => {
      utils.quality.dailyReportArchiveHistory.invalidate();
      toast.success(result.created ? "Backup Excel guardado na pasta." : "Este backup já estava guardado na pasta.");
    },
    onError: (error) => toast.error(error.message),
  });
  const archives = useMemo(() => (history.data ?? []).filter((archive) => {
    const term = query.trim().toLocaleLowerCase("pt-PT");
    return !term || `${dateFormat(archive.operationalDate, false)} v${archive.revision} ${archive.archiveKind === "initial" ? "inicial" : "retroativa"}`.toLocaleLowerCase("pt-PT").includes(term);
  }), [history.data, query]);

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Arquivo seguro</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight"><FolderArchive className="h-8 w-8 text-teal-700" />Backups diários</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Pasta com os ficheiros Excel guardados automaticamente para cada versão imutável do relatório diário.</p></div><div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Archive className="mr-2 inline h-4 w-4" />{history.data?.filter((archive) => archive.backupFileUrl).length ?? 0} ficheiros guardados</div></header>

    <Card className="border-0 panel-shadow"><CardHeader className="gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Ficheiros de backup</CardTitle><CardDescription>Os ficheiros são criados automaticamente ao arquivar a versão diária e ficam associados à respetiva data e revisão.</CardDescription></div><input aria-label="Pesquisar backups diários" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por data ou versão" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-600 placeholder:text-slate-400 focus:ring-2 md:w-64" /></CardHeader><CardContent>{history.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">A carregar a pasta de backups…</p> : archives.length ? <div className="divide-y overflow-hidden rounded-xl border border-slate-100">{archives.map((archive) => { const ready = Boolean(archive.backupFileUrl); const filename = archive.backupFileKey?.split("/").at(-1) ?? `relatorio-diario-${new Date(archive.operationalDate).toISOString().slice(0, 10)}-V${archive.revision}.xlsx`; return <article key={archive.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-700" /><p className="truncate font-medium text-slate-950">{filename}</p><Badge className={ready ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>{ready ? "Guardado" : "Por gerar"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{dateFormat(archive.operationalDate, false)} · Versão {archive.revision} · {archive.archiveKind === "initial" ? "Arquivo inicial" : "Revisão retroativa"}</p><p className="mt-1 text-xs text-slate-500">{ready ? `Criado em ${archive.backupGeneratedAt ? dateFormat(archive.backupGeneratedAt) : "—"} · ${fileSize(archive.backupSizeBytes)}` : "Será criado automaticamente; a Responsável pode recuperá-lo já."}</p></div><div className="flex shrink-0 flex-wrap gap-2">{ready ? <Button asChild size="sm"><a href={archive.backupFileUrl!} download={filename}><Download className="mr-2 h-4 w-4" />Descarregar</a></Button> : canManage ? <Button size="sm" variant="outline" onClick={() => generateBackup.mutate({ archiveId: archive.id })} disabled={generateBackup.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${generateBackup.isPending ? "animate-spin" : ""}`} />Gerar backup</Button> : <span className="self-center text-xs text-muted-foreground">A aguardar geração</span>}</div></article>; })}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><FolderArchive className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-medium text-slate-800">Ainda não existem backups nesta pasta.</p><p className="mt-1 text-sm text-muted-foreground">O primeiro ficheiro será guardado automaticamente quando for criado o próximo arquivo diário.</p></div>}</CardContent></Card>
  </section></div>;
}
