import { readFile, writeFile } from "node:fs/promises";

const controlsPath = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/Controls.tsx";
let controls = await readFile(controlsPath, "utf8");
if (!controls.includes("@/components/quality/OperatorAttribution")) {
  controls = controls.replace('import { ResultBadge, StatusBadge } from "@/components/quality/QualityUi";', 'import { ResultBadge, StatusBadge } from "@/components/quality/QualityUi";\nimport { OperatorAttribution } from "@/components/quality/OperatorAttribution";');
}
if (!controls.includes("<OperatorAttribution verb=\"Concluído por\"")) {
  const taskAuthorStart = controls.indexOf("{task.completedByName &&");
  const taskAuthorEnd = controls.indexOf("}</div><div className=\"flex flex-wrap", taskAuthorStart);
  if (taskAuthorStart < 0 || taskAuthorEnd < 0) throw new Error("A autoria de tarefa não foi localizada.");
  controls = `${controls.slice(0, taskAuthorStart)}{task.completedByName && <OperatorAttribution verb="Concluído por" name={task.completedByName} title={task.completedByTitle} />}${controls.slice(taskAuthorEnd + 1)}`;
}
await writeFile(controlsPath, controls);

const reportsPath = "/home/ubuntu/controlos-qualidade-alimentar/client/src/pages/Reports.tsx";
let reports = await readFile(reportsPath, "utf8");
if (!reports.includes("@/components/quality/OperatorAttribution")) {
  reports = reports.replace('import { Badge } from "@/components/ui/badge";', 'import { Badge } from "@/components/ui/badge";\nimport { OperatorAttribution } from "@/components/quality/OperatorAttribution";');
}
for (const [anchor, marker, replacement] of [
  ["incidences.map((item) => <div", "operatorLabel(item.reportedByName", '<OperatorAttribution name={item.reportedByName} title={item.reportedByTitle} />'],
  ["recentEntries.length ? recentEntries.map((entry) => <div", "operatorLabel(entry.registeredByName", '<OperatorAttribution name={entry.registeredByName} title={entry.registeredByTitle} />'],
]) {
  const anchorIndex = reports.indexOf(anchor);
  const markerIndex = reports.indexOf(marker, anchorIndex);
  const start = reports.lastIndexOf("<p", markerIndex);
  const end = reports.indexOf("</p>", markerIndex);
  if (anchorIndex < 0 || markerIndex < 0 || start < 0 || end < 0) throw new Error(`A autoria ${marker} não foi localizada.`);
  reports = `${reports.slice(0, start)}${replacement}${reports.slice(end + 4)}`;
}
await writeFile(reportsPath, reports);
