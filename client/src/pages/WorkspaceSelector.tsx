import { useQualityAccess } from "@/contexts/QualityAccessContext";
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react";
import React from "react";
import { Link } from "wouter";

const workspaces = [
  {
    title: "QualiControl",
    description: "Controlos de qualidade, verificações diárias, não conformidades, relatórios e gestão operacional.",
    path: "/qualicontrol",
    icon: ShieldCheck,
    accent: "from-teal-600 to-cyan-600",
    eyebrow: "Segurança alimentar",
  },
  {
    title: "Gestão de Ocorrências",
    description: "Ocorrências, ações corretivas, avaliação de eficácia e reclamações a fornecedores.",
    path: "/ocorrencias",
    icon: ClipboardList,
    accent: "from-blue-700 to-indigo-700",
    eyebrow: "Sistema de ocorrências A&S",
  },
];

export default function WorkspaceSelector() {
  const { activeProfile } = useQualityAccess();

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-10">
    <section className="mx-auto max-w-5xl">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Acesso operacional</p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Escolha a área de trabalho</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Sessão iniciada como <strong className="font-semibold text-slate-800">{activeProfile?.name}</strong>. Selecione o ambiente que pretende utilizar.</p>
          </div>
          <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900">
            <span className="font-semibold">{activeProfile?.title}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {workspaces.map(({ title, description, path, icon: Icon, accent, eyebrow }) => <Link key={path} href={path} className="group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
          <article className="h-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg">
            <div className={`flex h-28 items-start justify-between bg-gradient-to-br ${accent} p-6 text-white`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{eyebrow}</p>
                <h2 className="mt-2 text-2xl font-bold">{title}</h2>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><Icon className="h-6 w-6" /></span>
            </div>
            <div className="flex min-h-36 flex-col justify-between p-6">
              <p className="text-sm leading-6 text-slate-600">{description}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">Entrar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
          </article>
        </Link>)}
      </div>
    </section>
  </main>;
}
