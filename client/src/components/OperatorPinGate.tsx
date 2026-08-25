import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldCheck, UserRoundCheck } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

type Profile = { id: number; code: string; name: string; title: string; role: "technician" | "manager" | "viewer"; isConfigured: boolean; active: boolean };
type Access = { profiles: Profile[]; canBootstrap: boolean; needsInitialSetup: boolean };

function pinIsValid(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function OperatorPinGate({ access }: { access: Access }) {
  const utils = trpc.useUtils();
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [setupPins, setSetupPins] = useState<Record<string, string>>({});
  const activate = trpc.quality.activatePinProfile.useMutation({
    onSuccess: async () => { await utils.quality.accessStatus.invalidate(); toast.success("Perfil operacional ativado."); },
    onError: (error) => toast.error(error.message),
  });
  const configure = trpc.quality.configureTeamPins.useMutation({
    onSuccess: async () => { await utils.quality.accessStatus.invalidate(); toast.success("PINs definidos. Selecione o seu perfil para continuar."); },
    onError: (error) => toast.error(error.message),
  });

  const setupReady = access.profiles.length === 4 && access.profiles.every((profile) => pinIsValid(setupPins[profile.code] ?? ""));
  if (access.canBootstrap && access.needsInitialSetup) {
    return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto flex min-h-[80vh] max-w-3xl items-center"><Card className="w-full border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><div className="flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-3 text-teal-700"><ShieldCheck className="h-6 w-6" /></div><div><CardTitle>Configuração inicial de acessos</CardTitle><CardDescription className="mt-1">Defina um PIN numérico individual para cada elemento da equipa. Os PINs são guardados de forma protegida e não voltam a ser apresentados.</CardDescription></div></div></CardHeader><CardContent className="grid gap-5 p-6 md:grid-cols-3">{access.profiles.map((profile) => <div key={profile.id} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4"><div><p className="font-medium">{profile.name}</p><p className="text-sm text-muted-foreground">{profile.title}</p></div><div className="space-y-2"><Label htmlFor={`setup-pin-${profile.id}`}>PIN (4–8 algarismos)</Label><Input id={`setup-pin-${profile.id}`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={setupPins[profile.code] ?? ""} onChange={(event) => setSetupPins((current) => ({ ...current, [profile.code]: event.target.value.replace(/\D/g, "") }))} /></div></div>)}<div className="md:col-span-3"><Button className="w-full" size="lg" disabled={!setupReady || configure.isPending} onClick={() => configure.mutate({ pins: access.profiles.map((profile) => ({ code: profile.code, pin: setupPins[profile.code] })) })}>{configure.isPending ? "A guardar…" : "Guardar PINs da equipa"}</Button></div></CardContent></Card></div></main>;
  }

  const selected = access.profiles.find((profile) => profile.id === selectedProfileId);
  const configuredProfiles = access.profiles.filter((profile) => profile.active && profile.isConfigured);
  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto flex min-h-[80vh] max-w-2xl items-center"><Card className="w-full border-0 panel-shadow"><CardHeader className="border-b border-slate-100"><div className="flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-3 text-teal-700"><UserRoundCheck className="h-6 w-6" /></div><div><CardTitle>Acesso operacional</CardTitle><CardDescription className="mt-1">Selecione o seu perfil e introduza o PIN para registar controlos e consultar a operação.</CardDescription></div></div></CardHeader><CardContent className="space-y-6 p-6"><div className="grid gap-3 sm:grid-cols-3">{configuredProfiles.map((profile) => <button key={profile.id} type="button" onClick={() => { setSelectedProfileId(profile.id); setPin(""); }} className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${selectedProfileId === profile.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}><p className="font-medium">{profile.name}</p><p className="mt-1 text-sm text-muted-foreground">{profile.title}</p></button>)}</div>{selected ? <div className="mx-auto max-w-sm space-y-3"><div className="space-y-2"><Label htmlFor="operator-pin">PIN de {selected.name}</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="operator-pin" className="pl-9" type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter" && pinIsValid(pin)) activate.mutate({ profileId: selected.id, pin }); }} /></div></div><Button className="w-full" disabled={!pinIsValid(pin) || activate.isPending} onClick={() => activate.mutate({ profileId: selected.id, pin })}>{activate.isPending ? "A validar…" : "Entrar"}</Button></div> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{configuredProfiles.length ? "Selecione o seu perfil para introduzir o PIN." : "Não existem perfis configurados. A Responsável de Qualidade deve concluir a configuração inicial."}</p>}</CardContent></Card></div></main>;
}
