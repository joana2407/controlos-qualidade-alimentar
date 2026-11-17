import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { dateFormat } from "@/lib/quality";
import { trpc } from "@/lib/trpc";
import { Archive, Download, FileDown, FileSpreadsheet, FolderArchive, RefreshCw, Upload } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const LOCAL_BACKUP_FORMAT = "qualicontrol-local-storage-backup";

type LocalStorageBackup = {
  format: typeof LOCAL_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  entries: Record<string, string>;
};

function fileSize(value: number | null | undefined) {
  if (!value) return "—";
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function operationalDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export default function DailyBackups() {
  const { canManage } = useQualityAccess();
  const utils = trpc.useUtils();
  const history = trpc.quality.dailyReportArchiveHistory.useQuery();
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const generateBackup = trpc.quality.generateDailyReportArchiveBackup.useMutation({
    onSuccess: (result) => {
      utils.quality.dailyReportArchiveHistory.invalidate();
      toast.success(result.created ? "Backup Excel guardado na pasta." : "Este backup já estava guardado na pasta.");
    },
    onError: (error) => toast.error(error.message),
  });
  const generateMissingBackups = trpc.quality.generateMissingDailyReportArchiveBackups.useMutation({
    onSuccess: (result) => {
      utils.quality.dailyReportArchiveHistory.invalidate();
      toast.success(result.generated ? `${result.generated} backup${result.generated === 1 ? "" : "s"} Excel guardado${result.generated === 1 ? "" : "s"}.` : "Não existem backups pendentes.");
    },
    onError: (error) => toast.error(error.message),
  });
  const archives = useMemo(() => (history.data ?? []).filter((archive) => {
    const term = query.trim().toLocaleLowerCase("pt-PT");
    const operationalDate = operationalDateKey(archive.operationalDate);
    const textMatches = !term || `${dateFormat(archive.operationalDate, false)} v${archive.revision} ${archive.archiveKind === "initial" ? "inicial" : "retroativa"}`.toLocaleLowerCase("pt-PT").includes(term);
    return textMatches && (!startDate || operationalDate >= startDate) && (!endDate || operationalDate <= endDate);
  }), [endDate, history.data, query, startDate]);
  const missingCount = history.data?.filter((archive) => !archive.backupFileKey || !archive.backupFileUrl).length ?? 0;

  const exportLocalStorage = () => {
    const entries: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) {
        const value = window.localStorage.getItem(key);
        if (value !== null) entries[key] = value;
      }
    }
    const backup: LocalStorageBackup = {
      format: LOCAL_BACKUP_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qualicontrol-localStorage-${operationalDateKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Cópia local exportada (${Object.keys(entries).length} itens).`);
  };

  const importLocalStorage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<LocalStorageBackup>;
      if (parsed.format !== LOCAL_BACKUP_FORMAT || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
        throw new Error("O ficheiro não é uma cópia de segurança do QualiControl.");
      }
      const entries = Object.entries(parsed.entries).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string");
      if (!window.confirm(`Importar ${entries.length} itens e substituir todo o localStorage deste site? A aplicação será recarregada.`)) return;
      window.localStorage.clear();
      entries.forEach(([key, value]) => window.localStorage.setItem(key, value));
      toast.success("Cópia local importada. A aplicação vai ser recarregada.");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar a cópia de segurança.");
    }
  };

  return <div className="app-grid min-h-full -m-4 p-4 md:-m-6 md:p-6"><section className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-teal-700">Arquivo seguro</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight"><FolderArchive className="h-8 w-8 text-teal-700" />Backups diários</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Pasta com os ficheiros Excel guardados automaticamente para cada versão imutável do relatório diário.</p></div><div className="flex flex-wrap items-center justify-end gap-2"><div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950"><Archive className="mr-2 inline h-4 w-4" />{history.data?.filter((archive) => archive.backupFileUrl).length ?? 0} ficheiros guardados</div>{canManage && missingCount > 0 ? <Button size="sm" onClick={() => generateMissingBackups.mutate()} disabled={generateMissingBackups.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${generateMissingBackups.isPending ? "animate-spin" : ""}`} />{generateMissingBackups.isPending ? "A gerar…" : `Gerar ${missingCount} em falta`}</Button> : null}</div></header>

    <Card className="border-0 panel-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-teal-700" />Cópia local deste dispositivo</CardTitle><CardDescription>Exporta ou restaura os dados guardados no localStorage deste navegador. Os controlos e incidências que estão na base de dados online não são substituídos por esta cópia local.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button variant="outline" onClick={exportLocalStorage}><FileDown className="mr-2 h-4 w-4" />Exportar Cópia de Segurança</Button><Button variant="outline" onClick={() => importInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Importar Cópia de Segurança</Button><input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importLocalStorage} /></CardContent></Card>

    <Card className="border-0 panel-shadow"><CardHeader className="gap-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Ficheiros de backup</CardTitle><CardDescription>Os ficheiros são criados automaticamente ao arquivar a versão diária. A Responsável de Qualidade também pode gerar manualmente os ficheiros em falta.</CardDescription></div><input aria-label="Pesquisar backups diários" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por data ou versão" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-600 placeholder:text-slate-400 focus:ring-2 md:w-64" /></div><div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-end"><label className="grid gap-1 text-xs font-medium text-slate-700">Data inicial<input aria-label="Data inicial dos backups" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-teal-600 focus:ring-2" /></label><label className="grid gap-1 text-xs font-medium text-slate-700">Data final<input aria-label="Data final dos backups" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-teal-600 focus:ring-2" /></label>{(startDate || endDate || query) ? <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); setQuery(""); }}>Limpar filtros</Button> : null}</div></CardHeader><CardContent>{history.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">A carregar a pasta de backups…</p> : archives.length ? <div className="divide-y overflow-hidden rounded-xl border border-slate-100">{archives.map((archive) => { const ready = Boolean(archive.backupFileUrl); const filename = archive.backupFileKey?.split("/").at(-1) ?? `relatorio-diario-${new Date(archive.operationalDate).toISOString().slice(0, 10)}-V${archive.revision}.xlsx`; return <article key={archive.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-700" /><p className="truncate font-medium text-slate-950">{filename}</p><Badge className={ready ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>{ready ? "Guardado" : "Por gerar"}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{dateFormat(archive.operationalDate, false)} · Versão {archive.revision} · {archive.archiveKind === "initial" ? "Arquivo inicial" : "Revisão retroativa"}</p><p className="mt-1 text-xs text-slate-500">{ready ? `Criado em ${archive.backupGeneratedAt ? dateFormat(archive.backupGeneratedAt) : "—"} · ${fileSize(archive.backupSizeBytes)}` : "Será criado automaticamente; a Responsável pode gerá-lo já no botão ao lado."}</p></div><div className="flex shrink-0 flex-wrap gap-2">{ready ? <Button asChild size="sm"><a href={archive.backupFileUrl!} download={filename}><Download className="mr-2 h-4 w-4" />Descarregar</a></Button> : canManage ? <Button size="sm" variant="outline" onClick={() => generateBackup.mutate({ archiveId: archive.id })} disabled={generateBackup.isPending}><RefreshCw className={`mr-2 h-4 w-4 ${generateBackup.isPending ? "animate-spin" : ""}`} />Gerar backup</Button> : <span className="self-center text-xs text-muted-foreground">A aguardar geração</span>}</div></article>; })}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><FolderArchive className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-medium text-slate-800">Não existem backups para os filtros selecionados.</p><p className="mt-1 text-sm text-muted-foreground">Ajuste o intervalo de datas ou limpe os filtros para consultar todos os ficheiros guardados.</p></div>}</CardContent></Card>
  </section></div>;
}
