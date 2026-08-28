import { nextOperationalBusinessDay, operationalBusinessDayAfter } from "./businessCalendar";

export type TaskStatus = "pending" | "completed" | "cancelled" | string;

export type GroupableControlTask = {
  dueAt: Date | string;
  status: TaskStatus;
};

export type ControlTaskGroups<T> = {
  overdue: T[];
  today: T[];
  tomorrow: T[];
  thisWeek: T[];
  later: T[];
  completed: T[];
};

const dayStart = (value: Date | string) => {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**
 * Organiza a agenda operacional sem misturar tarefas concluídas com pendências.
 * A data de referência é injetável para permitir regressões determinísticas.
 */
export function groupControlTasks<T extends GroupableControlTask>(tasks: T[], referenceDate = new Date()): ControlTaskGroups<T> {
  const today = nextOperationalBusinessDay(referenceDate);
  const tomorrow = operationalBusinessDayAfter(today);
  const weekStart = dayStart(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 5);
  const buckets: ControlTaskGroups<T> = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [], completed: [] };

  tasks.forEach((task) => {
    if (task.status === "completed") {
      buckets.completed.push(task);
      return;
    }
    if (task.status === "cancelled") return;

    const due = dayStart(task.dueAt);
    if (due < today) buckets.overdue.push(task);
    else if (+due === +today) buckets.today.push(task);
    else if (+due === +tomorrow) buckets.tomorrow.push(task);
    else if (due < weekEnd) buckets.thisWeek.push(task);
    else buckets.later.push(task);
  });

  return buckets;
}
