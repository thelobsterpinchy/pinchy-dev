import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RoutineStep = {
  tool: string;
  input: Record<string, unknown>;
};

export type RoutineRecord = {
  name: string;
  createdAt: string;
  updatedAt: string;
  steps: RoutineStep[];
};

const ROUTINES_FILE = ".pinchy-routines.json";

export function loadRoutines(cwd: string): RoutineRecord[] {
  const path = resolve(cwd, ROUTINES_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RoutineRecord[];
  } catch {
    return [];
  }
}

export function saveRoutines(cwd: string, routines: RoutineRecord[]) {
  const path = resolve(cwd, ROUTINES_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(routines, null, 2), "utf8");
}

export function upsertRoutine(cwd: string, name: string, steps: RoutineStep[]) {
  const routines = loadRoutines(cwd);
  const now = new Date().toISOString();
  const existing = routines.find((routine) => routine.name === name);
  if (existing) {
    existing.steps = steps;
    existing.updatedAt = now;
  } else {
    routines.push({ name, createdAt: now, updatedAt: now, steps });
  }
  saveRoutines(cwd, routines);
  return routines.find((routine) => routine.name === name)!;
}
