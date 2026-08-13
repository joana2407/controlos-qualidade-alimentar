import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import React from "react";
import { cn } from "@/lib/utils";
import { Check, Minus, X } from "lucide-react";

export function ResultPicker({ value, onChange, compact = false }: { value: "C" | "NC" | "N/A"; onChange: (value: "C" | "NC" | "N/A") => void; compact?: boolean }) {
  const choices = [
    { value: "C" as const, label: "C", icon: Check, className: "result-c" },
    { value: "NC" as const, label: "NC", icon: X, className: "result-nc" },
    { value: "N/A" as const, label: "N/A", icon: Minus, className: "result-na" },
  ];
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-3 sm:flex")}> 
      {choices.map((choice) => {
        const Icon = choice.icon;
        return <Button type="button" key={choice.value} variant="outline" onClick={() => onChange(choice.value)} className={cn("h-10 gap-1.5 border font-semibold", value === choice.value && choice.className)}><Icon className="h-4 w-4" />{choice.label}</Button>;
      })}
    </div>
  );
}

export function BinaryResultPicker({ value, onChange }: { value: "C" | "NC"; onChange: (value: "C" | "NC") => void }) {
  const choices = [
    { value: "C" as const, label: "C", icon: Check, className: "result-c" },
    { value: "NC" as const, label: "NC", icon: X, className: "result-nc" },
  ];
  return <div className="grid grid-cols-2 gap-2 sm:flex">{choices.map((choice) => {
    const Icon = choice.icon;
    return <Button type="button" key={choice.value} variant="outline" onClick={() => onChange(choice.value)} className={cn("h-10 gap-1.5 border font-semibold", value === choice.value && choice.className)}><Icon className="h-4 w-4" />{choice.label}</Button>;
  })}</div>;
}

export function ResultBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge variant="outline" className="border-slate-300 text-slate-600">Sem resultado</Badge>;
  const classes: Record<string, string> = { C: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100", NC: "bg-red-100 text-red-800 hover:bg-red-100", "N/A": "bg-slate-100 text-slate-700 hover:bg-slate-100" };
  return <Badge className={classes[value] ?? "bg-slate-100 text-slate-700"}>{value}</Badge>;
}

export function SeverityBadge({ value }: { value: string }) {
  const classes: Record<string, string> = { critical: "bg-red-600 text-white hover:bg-red-600", high: "bg-orange-100 text-orange-800 hover:bg-orange-100", medium: "bg-amber-100 text-amber-800 hover:bg-amber-100", low: "bg-sky-100 text-sky-800 hover:bg-sky-100" };
  const labels: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa" };
  return <Badge className={classes[value] ?? classes.low}>{labels[value] ?? value}</Badge>;
}

export function StatusBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Por realizar", className: "bg-amber-100 text-amber-800" }, completed: { label: "Concluída", className: "bg-emerald-100 text-emerald-800" }, cancelled: { label: "Anulada", className: "bg-slate-100 text-slate-700" },
    open: { label: "Aberta", className: "bg-red-100 text-red-800" }, in_progress: { label: "Em curso", className: "bg-amber-100 text-amber-800" }, awaiting_validation: { label: "A validar", className: "bg-violet-100 text-violet-800" }, closed: { label: "Fechada", className: "bg-emerald-100 text-emerald-800" },
    verified: { label: "Verificada", className: "bg-emerald-100 text-emerald-800" },
  };
  const status = map[value] ?? { label: value, className: "bg-slate-100 text-slate-700" };
  return <Badge className={cn("font-medium hover:opacity-100", status.className)}>{status.label}</Badge>;
}
