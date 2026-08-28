import { describe, expect, it } from "vitest";
import { groupControlTasks } from "../client/src/lib/taskGrouping";

describe("agrupamento da agenda de controlos", () => {
  it("separa controlos concluídos das pendências atrasadas", () => {
    const referenceDate = new Date(2026, 7, 28, 10, 0, 0);
    const tasks = [
      { id: 1, dueAt: new Date(2026, 7, 27, 10, 0, 0), status: "pending" },
      { id: 2, dueAt: new Date(2026, 7, 27, 11, 0, 0), status: "completed" },
      { id: 3, dueAt: new Date(2026, 7, 28, 8, 0, 0), status: "pending" },
      { id: 4, dueAt: new Date(2026, 7, 28, 9, 0, 0), status: "completed" },
      { id: 5, dueAt: new Date(2026, 7, 31, 9, 0, 0), status: "pending" },
      { id: 6, dueAt: new Date(2026, 7, 26, 9, 0, 0), status: "cancelled" },
    ];

    const grouped = groupControlTasks(tasks, referenceDate);

    expect(grouped.overdue.map((task) => task.id)).toEqual([1]);
    expect(grouped.today.map((task) => task.id)).toEqual([3]);
    expect(grouped.tomorrow.map((task) => task.id)).toEqual([5]);
    expect(grouped.completed.map((task) => task.id)).toEqual([2, 4]);
    expect(grouped.overdue.some((task) => task.status === "completed")).toBe(false);
    expect(grouped.today.some((task) => task.status === "completed")).toBe(false);
  });
});
