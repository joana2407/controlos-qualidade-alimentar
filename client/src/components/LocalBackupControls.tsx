import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportCompleteBackup, restoreStorageEntries } from "@/lib/localPersistence";
import { LOCAL_SESSION_KEY } from "@/lib/localDatabase";

export function LocalBackupControls() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function exportBackup() {
    setBusy(true);
    try {
      const { entries, media } = await exportCompleteBackup();
      const content = { format: "qualicontrol-local-storage-backup", version: 1, exportedAt: new Date().toISOString(), entries, media };
      const url = URL.createObjectURL(new Blob([JSON.stringify(content)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `qualicontrol-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Cópia de segurança exportada com todos os dados e fotografias locais.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível exportar os dados."); }
    finally { setBusy(false); }
  }
  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== "qualicontrol-local-storage-backup" || parsed.version !== 1 || !parsed.entries || Array.isArray(parsed.entries) || typeof parsed.entries !== "object" || Object.values(parsed.entries).some(value => typeof value !== "string")) throw new Error("Selecione um ficheiro de cópia de segurança QualiControl válido.");
      const historyTransfer = parsed.transferKind === "remote-history";
      const message = historyTransfer ? "Importar o histórico preservado da base original? A base operacional local será substituída pelo histórico completo; os catálogos de processos guardados neste navegador serão mantidos. Exporte primeiro os registos locais, se já criou algum." : "Restaurar esta cópia de segurança e substituir os dados atuais deste navegador? Exporte uma cópia dos dados atuais antes de continuar.";
      if (!window.confirm(message)) return;
      await restoreStorageEntries(parsed.entries, historyTransfer, parsed.media ?? []);
      sessionStorage.removeItem(LOCAL_SESSION_KEY);
      toast.success("Histórico restaurado. A aplicação vai ser recarregada.");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível restaurar os dados. Os dados anteriores foram mantidos."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={exportBackup} disabled={busy}><Download className="mr-2 h-4 w-4" />Exportar Cópia de Segurança</Button><Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" />Importar Cópia de Segurança</Button><input type="file" ref={input} accept=".json,application/json" className="hidden" aria-label="Ficheiro de cópia de segurança JSON" onChange={importBackup} />{busy && <p role="status" className="self-center text-xs text-slate-600">A processar a cópia; aguarde sem fechar esta janela…</p>}</div>;
}
