import React from "react";

export function OperatorAttribution({ name, title, verb = "Registado por" }: { name?: string | null; title?: string | null; verb?: string }) {
  const label = name ? `${name}${title ? ` · ${title}` : ""}` : "Não identificado";
  return <p className="mt-1 text-xs text-muted-foreground" data-testid="operator-attribution">{verb}: {label}</p>;
}
