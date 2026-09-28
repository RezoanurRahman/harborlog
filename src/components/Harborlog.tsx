import {
  $,
  component$,
  useComputed$,
  useSignal,
  useVisibleTask$,
  type QRL,
} from '@builder.io/qwik';

import type {
  Activity,
  ActivityKind,
  CreateTaskInput,
  CreateVesselInput,
  Dashboard,
  Part,
  Task,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
  Vessel,
  VesselStatus,
} from '../shared/types';
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, VESSEL_STATUSES } from '../shared/types';

/* ==========================================================================
 * UI contract
 * --------------------------------------------------------------------------
 * Data shapes come straight from `src/shared/types.ts`; the Elysia backend
 * owns the runtime contract. Only presentational unions live in this file.
 * ========================================================================== */

export type ViewKey = 'dashboard' | 'fleet' | 'queue' | 'activity';
export type QueueFilter = 'all' | 'due-soon' | 'in-progress' | 'completed';

/* ==========================================================================
 * Constants
 * ========================================================================== */

const API = {
  dashboard: '/api/dashboard',
  vessels: '/api/vessels',
  tasks: '/api/tasks',
  activity: '/api/activity',
} as const;

const STATUS_ORDER = TASK_STATUSES;

const STATUS_META: Record<TaskStatus, { label: string; glyph: string; badge: string }> = {
  scheduled: { label: 'Scheduled', glyph: '○', badge: 'badge--status-todo' },
  'in-progress': { label: 'In progress', glyph: '◐', badge: 'badge--status-progress' },
  complete: { label: 'Completed', glyph: '✓', badge: 'badge--status-done' },
};

const PRIORITY_ORDER = TASK_PRIORITIES;

const PRIORITY_META: Record<TaskPriority, { label: string; badge: string }> = {
  low: { label: 'Low', badge: 'badge--priority-low' },
  medium: { label: 'Medium', badge: 'badge--priority-medium' },
  high: { label: 'High', badge: 'badge--priority-high' },
};

const CATEGORY_ORDER = TASK_CATEGORIES;

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  engine: 'Engine',
  hull: 'Hull',
  safety: 'Safety',
  electrical: 'Electrical',
  rigging: 'Rigging',
};

const VESSEL_STATUS_ORDER = VESSEL_STATUSES;

const VESSEL_STATUS_META: Record<VesselStatus, { label: string; badge: string }> = {
  ready: { label: 'Ready', badge: 'badge--vessel-active' },
  attention: { label: 'Needs attention', badge: 'badge--vessel-maintenance' },
  hauled: { label: 'Hauled out', badge: 'badge--vessel-dry' },
};

/** Fallback actor for activity entries: the API does not record a user. */
const ACTIVITY_ACTOR = 'Dock crew';

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due-soon', label: 'Due soon' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

const NAV: { key: ViewKey; label: string; icon: string }[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  },
  {
    key: 'fleet',
    label: 'Fleet',
    icon: 'M4 18h16M6 18l-2-6 8-3 8 3-2 6M12 9V4M9 4h6',
  },
  { key: 'queue', label: 'Work queue', icon: 'M4 6h16M4 12h10M4 18h16M18 10l2 2 3-4' },
  { key: 'activity', label: 'Activity', icon: 'M3 12h4l3 7 4-14 3 7h4' },
];

const DAY_MS = 86_400_000;

const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'vessel-created',
  'vessel-updated',
  'task-created',
  'task-updated',
  'task-completed',
  'task-deleted',
  'part-added',
  'part-checked',
  'part-unchecked',
];

function isOneOf<T extends string>(options: readonly T[], value: string): value is T {
  return (options as readonly string[]).includes(value);
}

/** Parse a wire value onto the canonical vocabulary; unknown input falls back. */
function normalizeStatus(value: string): TaskStatus {
  const key = value.trim().toLowerCase();
  return isOneOf(TASK_STATUSES, key) ? key : 'scheduled';
}

function normalizePriority(value: string): TaskPriority {
  const key = value.trim().toLowerCase();
  return isOneOf(TASK_PRIORITIES, key) ? key : 'medium';
}

function normalizeCategory(value: string): TaskCategory {
  const key = value.trim().toLowerCase();
  return isOneOf(TASK_CATEGORIES, key) ? key : 'engine';
}

function normalizeVesselStatus(value: string): VesselStatus {
  const key = value.trim().toLowerCase();
  return isOneOf(VESSEL_STATUSES, key) ? key : 'ready';
}

function normalizeActivityKind(value: string): ActivityKind {
  const key = value.trim().toLowerCase();
  return isOneOf(ACTIVITY_KINDS, key) ? key : 'task-updated';
}

/* ==========================================================================
 * Helpers — dates, formatting, shapes
 * ========================================================================== */

const dayMonthFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const longDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const stampFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysUntil(value: string | null | undefined, now: Date): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? dayMonthFmt.format(date) : 'Not scheduled';
}

function formatLongDate(value: Date | string): string {
  const date = typeof value === 'string' ? parseDate(value) : value;
  return date ? longDateFmt.format(date) : 'Unknown';
}

function formatStamp(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? stampFmt.format(date) : '—';
}

function relativeTime(value: string | null | undefined, now: Date): string {
  const date = parseDate(value);
  if (!date) return 'just now';
  const diff = now.getTime() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value);
}

type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'closed';

function dueInfo(
  value: string | null | undefined,
  status: TaskStatus,
  now: Date,
): { tone: DueTone; text: string } {
  const date = parseDate(value);
  const days = daysUntil(value, now);
  if (!date || days === null) return { tone: 'later', text: 'No due date' };
  if (status === 'complete') return { tone: 'closed', text: `Closed ${formatDate(value)}` };
  if (days < 0) {
    const late = Math.abs(days);
    return { tone: 'overdue', text: late === 1 ? 'Overdue by 1 day' : `Overdue by ${late} days` };
  }
  if (days === 0) return { tone: 'today', text: 'Due today' };
  if (days === 1) return { tone: 'soon', text: 'Due tomorrow' };
  if (days <= 7) return { tone: 'soon', text: `Due ${weekdayFmt.format(date)}` };
  return { tone: 'later', text: `Due ${formatDate(value)}` };
}

function dueClass(tone: DueTone): string {
  switch (tone) {
    case 'overdue':
      return 'due due--overdue';
    case 'today':
      return 'due due--today';
    case 'soon':
      return 'due due--soon';
    default:
      return 'due';
  }
}

function isDone(status: TaskStatus): boolean {
  return status === 'complete';
}

function statusMeta(status: TaskStatus) {
  return STATUS_META[status];
}

function priorityMeta(priority: TaskPriority) {
  return PRIORITY_META[priority];
}

function vesselStatusMeta(status: VesselStatus) {
  return VESSEL_STATUS_META[status];
}

function categoryLabel(category: TaskCategory): string {
  return CATEGORY_LABEL[category] ?? String(category);
}

function formatHours(hours: number | null | undefined): string {
  if (typeof hours !== 'number' || Number.isNaN(hours)) return '—';
  return hours === 1 ? '1 h' : `${hours} h`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readList(value: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  for (const candidate of [key, 'items', 'data', 'results']) {
    const found = record[candidate];
    if (Array.isArray(found)) return found.map(asRecord);
  }
  return [];
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readParts(value: unknown): Part[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: readString(record.id, `part-${index}`),
      name: readString(record.name, 'Unnamed part'),
      quantity: readNumber(record.quantity, 1),
      checked: readBoolean(record.checked, false),
    };
  });
}

function adaptTask(entry: Record<string, unknown>, index: number): Task {
  return {
    id: readString(entry.id, `task-${index}`),
    vesselId: readString(entry.vesselId),
    title: readString(entry.title, 'Untitled task'),
    category: normalizeCategory(readString(entry.category)),
    priority: normalizePriority(readString(entry.priority)),
    status: normalizeStatus(readString(entry.status)),
    dueDate: readString(entry.dueDate),
    assignee: readString(entry.assignee, 'Unassigned'),
    estimatedHours: readNumber(entry.estimatedHours),
    notes: readString(entry.notes),
    parts: readParts(entry.parts),
    createdAt: readString(entry.createdAt),
    updatedAt: readString(entry.updatedAt),
  };
}

function adaptVessel(entry: Record<string, unknown>, index: number): Vessel {
  return {
    id: readString(entry.id, `vessel-${index}`),
    name: readString(entry.name, 'Unnamed vessel'),
    model: readString(entry.model),
    berth: readString(entry.berth),
    owner: readString(entry.owner),
    status: normalizeVesselStatus(readString(entry.status)),
    lastServiced: readString(entry.lastServiced),
    nextInspection: readString(entry.nextInspection),
    accent: readString(entry.accent),
  };
}

function adaptActivity(entry: Record<string, unknown>, index: number): Activity {
  const activity: Activity = {
    id: readString(entry.id, `activity-${index}`),
    kind: normalizeActivityKind(readString(entry.kind)),
    message: readString(entry.message, 'Activity recorded'),
    timestamp: readString(entry.timestamp),
  };
  if (typeof entry.taskId === 'string') activity.taskId = entry.taskId;
  if (typeof entry.vesselId === 'string') activity.vesselId = entry.vesselId;
  return activity;
}

const DASHBOARD_KEYS = [
  'totalVessels',
  'activeTasks',
  'dueThisWeek',
  'overdue',
  'completedThisMonth',
  'completionRate',
  'attentionVessels',
  'upcoming',
  'recentActivity',
] as const;

function adaptDashboard(value: unknown): Dashboard | null {
  const record = asRecord(value);
  if (!DASHBOARD_KEYS.some((key) => key in record)) return null;
  return {
    totalVessels: readNumber(record.totalVessels),
    activeTasks: readNumber(record.activeTasks),
    dueThisWeek: readNumber(record.dueThisWeek),
    overdue: readNumber(record.overdue),
    completedThisMonth: readNumber(record.completedThisMonth),
    completionRate: readNumber(record.completionRate),
    attentionVessels: readList(record.attentionVessels, 'attentionVessels').map(adaptVessel),
    upcoming: readList(record.upcoming, 'upcoming').map(adaptTask),
    recentActivity: readList(record.recentActivity, 'recentActivity').map(adaptActivity),
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : null),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as Record<string, unknown>;
      detail = readString(body.error) || readString(body.message);
    } catch {
      detail = '';
    }
    throw new Error(detail || `${response.status} ${response.statusText || 'Request failed'}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  text: string;
}

function errorMessage(error: unknown, fallback = 'The request could not be completed.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const doneDelta = (isDone(a.status) ? 1 : 0) - (isDone(b.status) ? 1 : 0);
    if (doneDelta !== 0) return doneDelta;
    const aDue = parseDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDue = parseDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return a.title.localeCompare(b.title);
  });
}

function matchesFilter(task: Task, filter: QueueFilter, now: Date): boolean {
  switch (filter) {
    case 'completed':
      return isDone(task.status);
    case 'in-progress':
      return task.status === 'in-progress';
    case 'due-soon': {
      if (isDone(task.status)) return false;
      const days = daysUntil(task.dueDate, now);
      return days !== null && days <= 7;
    }
    default:
      return true;
  }
}

function matchesQuery(task: Task, vesselName: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    task.title,
    task.assignee,
    task.notes,
    categoryLabel(task.category),
    statusMeta(task.status).label,
    vesselName,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/** CSS suffix used to tone an activity dot for a given event kind. */
function activityTone(kind: ActivityKind): string {
  switch (kind) {
    case 'vessel-created':
    case 'task-created':
    case 'part-added':
      return 'created';
    case 'vessel-updated':
    case 'task-updated':
      return 'updated';
    case 'task-completed':
    case 'part-checked':
      return 'completed';
    case 'task-deleted':
    case 'part-unchecked':
      return 'deleted';
    default:
      return 'created';
  }
}

/** Stroke path for the small glyph that heads an activity entry. */
function activityIcon(kind: ActivityKind): string {
  switch (kind) {
    case 'task-completed':
    case 'part-checked':
      return 'M20 6 9 17l-5-5';
    case 'task-created':
    case 'vessel-created':
    case 'part-added':
      return 'M12 5v14M5 12h14';
    case 'task-deleted':
    case 'part-unchecked':
      return 'M6 6l12 12M18 6 6 18';
    default:
      return 'M4 12h4l3 7 4-14 3 7h4';
  }
}

/* ==========================================================================
 * Component
 * ========================================================================== */

export const Harborlog = component$(() => {
  /* ---------------------------------------------------------------- state */
  const view = useSignal<ViewKey>('dashboard');
  const status = useSignal<'loading' | 'ready' | 'error'>('loading');
  const loadError = useSignal('');
  const refreshing = useSignal(false);
  const syncing = useSignal(false);

  const dashboard = useSignal<Dashboard | null>(null);
  const vessels = useSignal<Vessel[]>([]);
  const tasks = useSignal<Task[]>([]);
  const events = useSignal<Activity[]>([]);
  const lastSync = useSignal('');

  const query = useSignal('');
  const filter = useSignal<QueueFilter>('all');

  const selectedId = useSignal<string | null>(null);
  const confirmDelete = useSignal(false);
  const busyTaskId = useSignal('');
  const busyAction = useSignal('');

  const createOpen = useSignal(false);
  const createError = useSignal('');
  const createSubmitting = useSignal(false);

  const vesselOpen = useSignal(false);
  const vesselError = useSignal('');
  const vesselSubmitting = useSignal(false);
  const pendingVesselId = useSignal('');

  const toast = useSignal<Toast | null>(null);
  const clock = useSignal(Date.now());
  const notesRef = useSignal<HTMLTextAreaElement>();
  const partNameRef = useSignal<HTMLInputElement>();

  /* ------------------------------------------------------------ derived */
  const nowDate = useComputed$(() => new Date(clock.value));

  const vesselNames = useComputed$(() => {
    const map: Record<string, string> = {};
    for (const vessel of vessels.value) map[vessel.id] = vessel.name;
    return map;
  });

  const selectedTask = useComputed$(
    () => tasks.value.find((task) => task.id === selectedId.value) ?? null,
  );

  const overdueCount = useComputed$(() => {
    const now = nowDate.value;
    return tasks.value.filter((task) => {
      if (isDone(task.status)) return false;
      const days = daysUntil(task.dueDate, now);
      return days !== null && days < 0;
    }).length;
  });

  const kpis = useComputed$(() => {
    const list = tasks.value;
    const now = nowDate.value;
    const completed = list.filter((task) => isDone(task.status)).length;
    const derivedActive = list.length - completed;
    const derivedDue = list.filter((task) => {
      if (isDone(task.status)) return false;
      const days = daysUntil(task.dueDate, now);
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const derivedOverdue = overdueCount.value;
    const derivedRate = list.length === 0 ? 0 : Math.round((completed / list.length) * 100);
    const month = now.toISOString().slice(0, 7);
    const derivedThisMonth = list.filter(
      (task) => isDone(task.status) && task.updatedAt.slice(0, 7) === month,
    ).length;
    const totals = dashboard.value;
    const completionRate = totals ? totals.completionRate : derivedRate;
    return {
      active: totals ? totals.activeTasks : derivedActive,
      dueThisWeek: totals ? totals.dueThisWeek : derivedDue,
      overdue: totals ? totals.overdue : derivedOverdue,
      completedThisMonth: totals ? totals.completedThisMonth : derivedThisMonth,
      completionRate: Math.max(0, Math.min(100, Math.round(completionRate))),
      completed,
      total: list.length,
    };
  });

  const queue = useComputed$(() => {
    const now = nowDate.value;
    const names = vesselNames.value;
    return sortTasks(
      tasks.value.filter(
        (task) =>
          matchesFilter(task, filter.value, now) &&
          matchesQuery(task, names[task.vesselId] ?? '', query.value),
      ),
    );
  });

  const filterCounts = useComputed$(() => {
    const list = tasks.value;
    const done = list.filter((task) => isDone(task.status)).length;
    return {
      all: list.length,
      'due-soon': list.filter((task) => matchesFilter(task, 'due-soon', nowDate.value)).length,
      'in-progress': list.filter((task) => matchesFilter(task, 'in-progress', nowDate.value))
        .length,
      completed: done,
    } as Record<QueueFilter, number>;
  });

  const fleet = useComputed$(() => {
    const list = vessels.value;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  });

  const vesselLoad = useComputed$(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks.value) {
      if (isDone(task.status)) continue;
      counts[task.vesselId] = (counts[task.vesselId] ?? 0) + 1;
    }
    return counts;
  });

  const recentEvents = useComputed$(() =>
    [...events.value]
      .sort(
        (a, b) =>
          (parseDate(b.timestamp)?.getTime() ?? 0) - (parseDate(a.timestamp)?.getTime() ?? 0),
      )
      .slice(0, 8),
  );

  /* --------------------------------------------------------- data access */
  const fetchAll = $(async () => {
    syncing.value = true;
    try {
      const [dashboardPayload, vesselsPayload, tasksPayload, activityPayload] = await Promise.all([
        request<unknown>(API.dashboard),
        request<unknown>(API.vessels),
        request<unknown>(API.tasks),
        request<unknown>(API.activity),
      ]);
      dashboard.value = adaptDashboard(dashboardPayload);
      vessels.value = readList(vesselsPayload, 'vessels').map(adaptVessel);
      tasks.value = readList(tasksPayload, 'tasks').map(adaptTask);
      events.value = readList(activityPayload, 'activity').map(adaptActivity);
      lastSync.value = new Date().toISOString();
    } finally {
      syncing.value = false;
    }
  });

  const loadAll = $(async () => {
    status.value = 'loading';
    loadError.value = '';
    try {
      await fetchAll();
      status.value = 'ready';
    } catch (error) {
      status.value = 'error';
      loadError.value = errorMessage(error, 'The Harborlog API is not reachable.');
    }
  });

  const refreshAll = $(async () => {
    refreshing.value = true;
    try {
      await fetchAll();
      status.value = 'ready';
      loadError.value = '';
    } catch (error) {
      if (status.value !== 'ready') {
        status.value = 'error';
        loadError.value = errorMessage(error, 'The Harborlog API is not reachable.');
      }
      throw error;
    } finally {
      refreshing.value = false;
    }
  });

  const notify = $((tone: Toast['tone'], title: string, text = '') => {
    toast.value = { id: Date.now(), tone, title, text };
  });

  const surfaceError = $((title: string, error: unknown) => {
    notify('error', title, errorMessage(error));
  });

  /* ------------------------------------------------------------ mutations */
  const patchTask = $(async (id: string, patch: UpdateTaskInput, successTitle: string) => {
    busyTaskId.value = id;
    busyAction.value = 'patch';
    try {
      await request<Task>(`${API.tasks}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await refreshAll();
      notify('success', successTitle);
    } catch (error) {
      await surfaceError('Task update failed', error);
    } finally {
      busyTaskId.value = '';
      busyAction.value = '';
    }
  });

  const deleteTask = $(async (id: string) => {
    busyTaskId.value = id;
    busyAction.value = 'delete';
    try {
      await request<unknown>(`${API.tasks}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      selectedId.value = null;
      confirmDelete.value = false;
      await refreshAll();
      notify('success', 'Task deleted', 'The work queue has been updated.');
    } catch (error) {
      await surfaceError('Could not delete task', error);
    } finally {
      busyTaskId.value = '';
      busyAction.value = '';
    }
  });

  const togglePart = $(async (taskId: string, partId: string, checked: boolean) => {
    tasks.value = tasks.value.map((task) =>
      task.id === taskId
        ? {
            ...task,
            parts: task.parts.map((part) => (part.id === partId ? { ...part, checked } : part)),
          }
        : task,
    );
    try {
      await request<unknown>(
        `${API.tasks}/${encodeURIComponent(taskId)}/parts/${encodeURIComponent(partId)}`,
        { method: 'PATCH', body: JSON.stringify({ checked }) },
      );
      await refreshAll();
    } catch (error) {
      await refreshAll().catch(() => undefined);
      await surfaceError('Could not update the parts checklist', error);
    }
  });

  const addPart = $(async (taskId: string, name: string, quantity: number) => {
    try {
      await request<unknown>(`${API.tasks}/${encodeURIComponent(taskId)}/parts`, {
        method: 'POST',
        body: JSON.stringify({ name, quantity }),
      });
      await refreshAll();
      notify('success', 'Part added', `${name} was added to the checklist.`);
    } catch (error) {
      await surfaceError('Could not add part', error);
    }
  });

  const createTask = $(async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const payload: CreateTaskInput = {
      vesselId: String(data.get('vesselId') ?? ''),
      title: String(data.get('title') ?? '').trim(),
      category: String(data.get('category') ?? 'engine') as TaskCategory,
      priority: String(data.get('priority') ?? 'medium') as TaskPriority,
      dueDate: String(data.get('dueDate') ?? ''),
      assignee: String(data.get('assignee') ?? '').trim() || 'Unassigned',
      estimatedHours: Number(data.get('estimatedHours') ?? 0) || 0,
      notes: String(data.get('notes') ?? '').trim(),
    };

    if (!payload.vesselId) {
      createError.value = 'Choose the vessel this work belongs to.';
      return;
    }
    if (!payload.title) {
      createError.value = 'Add a short title so the crew knows what to do.';
      return;
    }
    if (!payload.dueDate) {
      createError.value = 'Pick a due date for the task.';
      return;
    }

    createError.value = '';
    createSubmitting.value = true;
    try {
      await request<unknown>(API.tasks, { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      createOpen.value = false;
      notify(
        'success',
        'Maintenance logged',
        `${payload.title} · ${vesselNames.value[payload.vesselId] ?? 'vessel'}`,
      );
    } catch (error) {
      createError.value = errorMessage(error, 'Could not save the task.');
      await surfaceError('Could not log maintenance', error);
    } finally {
      createSubmitting.value = false;
    }
  });

  const createVessel = $(async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const payload: CreateVesselInput = {
      name: String(data.get('name') ?? '').trim(),
      model: String(data.get('model') ?? '').trim(),
      berth: String(data.get('berth') ?? '').trim(),
      owner: String(data.get('owner') ?? '').trim(),
    };
    const nextInspection = String(data.get('nextInspection') ?? '').trim();
    if (!payload.name) {
      vesselError.value = 'A vessel needs a name.';
      return;
    }
    if (!payload.model) {
      vesselError.value = 'Add the vessel model for the maintenance log.';
      return;
    }
    if (!payload.berth) {
      vesselError.value = 'Assign a berth so the crew can find the vessel.';
      return;
    }
    if (!payload.owner) {
      vesselError.value = 'Add the owner on file.';
      return;
    }
    if (nextInspection) payload.nextInspection = nextInspection;
    vesselError.value = '';
    vesselSubmitting.value = true;
    try {
      await request<unknown>(API.vessels, { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      vesselOpen.value = false;
      notify('success', 'Vessel added to the fleet', payload.name);
    } catch (error) {
      vesselError.value = errorMessage(error, 'Could not add the vessel.');
      await surfaceError('Could not add vessel', error);
    } finally {
      vesselSubmitting.value = false;
    }
  });

  const setVesselStatus = $(async (id: string, next: VesselStatus) => {
    pendingVesselId.value = id;
    try {
      await request<unknown>(`${API.vessels}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await refreshAll();
      notify('success', 'Vessel status updated', vesselStatusMeta(next).label);
    } catch (error) {
      await surfaceError('Could not update vessel status', error);
    } finally {
      pendingVesselId.value = '';
    }
  });

  const saveNotes = $(async (id: string, notes: string) => {
    busyTaskId.value = id;
    busyAction.value = 'notes';
    try {
      await request<unknown>(`${API.tasks}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
      await refreshAll();
      notify('success', 'Notes saved');
    } catch (error) {
      await surfaceError('Could not save notes', error);
    } finally {
      busyTaskId.value = '';
      busyAction.value = '';
    }
  });

  const submitPart = $(async (taskId: string, form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get('partName') ?? '').trim();
    const quantity = Number(data.get('partQuantity') ?? 1) || 1;
    if (!name) return;
    form.reset();
    partNameRef.value?.focus();
    await addPart(taskId, name, quantity);
  });

  /* -------------------------------------------------------------- effects */
  // Initial load: dashboard, vessels, tasks and activity in parallel.
  useVisibleTask$(() => {
    void loadAll();
  });

  // Keep relative dates ("in 3 days") honest without a full refresh.
  useVisibleTask$(({ cleanup }) => {
    const timer = setInterval(() => {
      clock.value = Date.now();
    }, 60_000);
    cleanup(() => clearInterval(timer));
  });

  // Dismiss toasts automatically.
  useVisibleTask$(({ track }) => {
    const current = track(() => toast.value);
    if (!current) return;
    const timer = setTimeout(() => {
      toast.value = null;
    }, 5200);
    return () => clearTimeout(timer);
  });

  // Escape closes overlays and the page behind them stops scrolling.
  useVisibleTask$(({ track }) => {
    const overlayOpen = track(
      () => selectedId.value !== null || createOpen.value || vesselOpen.value,
    );
    if (!overlayOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (vesselOpen.value) {
        vesselOpen.value = false;
        return;
      }
      if (createOpen.value) {
        createOpen.value = false;
        return;
      }
      selectedId.value = null;
      confirmDelete.value = false;
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  });

  // Uncontrolled notes field: keep it in step with the selected task.
  useVisibleTask$(({ track }) => {
    const task = track(() => selectedTask.value);
    const element = notesRef.value;
    if (!element || !task) return;
    element.value = task.notes;
  });

  /* --------------------------------------------------------------- render */
  const closeDrawer = $(() => {
    selectedId.value = null;
    confirmDelete.value = false;
  });

  const openTask = $((id: string) => {
    selectedId.value = id;
    confirmDelete.value = false;
  });

  /* ------------------------------------------------------- render helpers */
  const renderIcon = (path: string, size = 18) => (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );

  const navCount = (key: ViewKey): number | null => {
    switch (key) {
      case 'dashboard':
        return overdueCount.value > 0 ? overdueCount.value : null;
      case 'fleet':
        return vessels.value.length;
      case 'queue':
        return tasks.value.filter((task) => !isDone(task.status)).length;
      case 'activity':
        return events.value.length;
      default:
        return null;
    }
  };

  const renderSkeletonKpis = () => (
    <div class="kpis" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div class="kpi" key={index}>
          <div class="skeleton skeleton--line" style="width: 58%"></div>
          <div class="skeleton skeleton--line" style="width: 34%; height: 26px"></div>
          <div class="skeleton skeleton--line" style="width: 72%"></div>
        </div>
      ))}
    </div>
  );

  const renderSkeletonRows = (rows: number) => (
    <div class="loading-block" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div class="skeleton skeleton--line" style="height: 46px" key={index}></div>
      ))}
    </div>
  );

  const renderState = (options: {
    tone: 'empty' | 'error' | 'loading';
    title: string;
    text: string;
    actionLabel?: string;
    onAction?: QRL<() => void>;
  }) => (
    <div
      class={`state${options.tone === 'error' ? ' state--error' : ''}`}
      role={options.tone === 'error' ? 'alert' : undefined}
    >
      <span class="state__icon" aria-hidden="true">
        {renderIcon(
          options.tone === 'error'
            ? 'M12 9v4M12 17h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'
            : 'M4 7h16M4 12h10M4 17h7',
          22,
        )}
      </span>
      <p class="state__title">{options.title}</p>
      <p class="state__text">{options.text}</p>
      {options.actionLabel && options.onAction ? (
        <div class="state__actions">
          <button class="btn btn--ghost btn--sm" type="button" onClick$={options.onAction}>
            {options.actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderTaskRow = (task: Task, compact: boolean) => {
    const vesselName = vesselNames.value[task.vesselId] ?? 'Unassigned vessel';
    const due = dueInfo(task.dueDate, task.status, nowDate.value);
    const done = isDone(task.status);
    const meta = statusMeta(task.status);
    const priority = priorityMeta(task.priority);
    const isSelected = selectedId.value === task.id;
    const isBusy = busyTaskId.value === task.id;

    return (
      <li key={task.id}>
        <article
          class={[
            'task-row',
            due.tone === 'overdue' ? 'task-row--overdue' : '',
            isSelected ? 'task-row--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span class={`marker marker--${task.category}`} aria-hidden="true"></span>
          <div class="task-row__body">
            <p class="task-row__title" data-done={done ? 'true' : 'false'}>
              {task.title}
            </p>
            <p class="task-row__meta">
              <span class="tag">
                {renderIcon('M4 18h16M6 18l-2-6 8-3 8 3-2 6M12 9V4M9 4h6', 14)}
                {vesselName}
              </span>
              <span class="task-row__sep" aria-hidden="true">
                ·
              </span>
              <span class="tag">{categoryLabel(task.category)}</span>
              <span class="task-row__sep" aria-hidden="true">
                ·
              </span>
              <span class={dueClass(due.tone)} title={formatLongDate(task.dueDate)}>
                {due.text}
              </span>
              {!compact ? (
                <>
                  <span class="task-row__sep" aria-hidden="true">
                    ·
                  </span>
                  <span class="tag">{task.assignee}</span>
                </>
              ) : null}
            </p>
          </div>
          <div class="task-row__tags">
            <span class={`badge ${priority.badge}`}>
              <span class="badge__dot" aria-hidden="true"></span>
              {priority.label}
            </span>
            <span class={`badge ${meta.badge}`}>
              <span aria-hidden="true">{meta.glyph}</span>
              {meta.label}
            </span>
          </div>
          <div class="task-row__actions">
            <button
              class="btn btn--sm btn--ghost"
              type="button"
              data-task-id={task.id}
              aria-haspopup="dialog"
              aria-expanded={isSelected ? 'true' : 'false'}
              onClick$={(_, element) => openTask(element.dataset.taskId ?? '')}
            >
              {isBusy ? <span class="spinner" aria-hidden="true"></span> : null}
              Details
            </button>
          </div>
        </article>
      </li>
    );
  };

  const renderVesselCard = (vessel: Vessel, showStatusControl: boolean) => {
    const meta = vesselStatusMeta(vessel.status);
    const openTasks = vesselLoad.value[vessel.id] ?? 0;
    const inspectionDays = daysUntil(vessel.nextInspection, nowDate.value);

    return (
      <article class="vessel-card" key={vessel.id}>
        <div class="vessel-card__top">
          <div>
            <p class="vessel-card__name">{vessel.name}</p>
            <p class="vessel-card__meta">
              {vessel.model || 'Model on file'}
              {vessel.berth ? ` · Berth ${vessel.berth}` : ''}
            </p>
          </div>
          <span class={`badge ${meta.badge}`}>
            <span class="badge__dot" aria-hidden="true"></span>
            {meta.label}
          </span>
        </div>
        <div class="vessel-card__stats">
          <span>
            Next inspection{' '}
            <b>
              {inspectionDays !== null && inspectionDays < 0
                ? `Overdue (${formatDate(vessel.nextInspection)})`
                : formatDate(vessel.nextInspection)}
            </b>
          </span>
          <span>
            Last serviced <b>{formatDate(vessel.lastServiced)}</b>
          </span>
          <span>
            Open tasks <b>{openTasks}</b>
          </span>
        </div>
        <div class="vessel-card__foot">
          <span class="tag">Owner · {vessel.owner || 'Unassigned'}</span>
          <button
            class="btn btn--sm btn--ghost"
            type="button"
            data-vessel-id={vessel.id}
            onClick$={(_, element) => {
              const id = element.dataset.vesselId ?? '';
              query.value = vesselNames.value[id] ?? '';
              filter.value = 'all';
              view.value = 'queue';
            }}
          >
            View work
          </button>
        </div>
        {showStatusControl ? (
          <label class="field">
            <span class="field__label">Service status</span>
            <select
              class="field__input"
              value={vessel.status}
              aria-label={`Service status for ${vessel.name}`}
              disabled={pendingVesselId.value === vessel.id}
              onChange$={(_, element) => {
                const next = element.value as VesselStatus;
                if (next !== vessel.status) setVesselStatus(vessel.id, next);
              }}
            >
              {VESSEL_STATUS_ORDER.map((option) => (
                <option value={option} key={option} selected={option === vessel.status}>
                  {vesselStatusMeta(option).label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </article>
    );
  };

  const renderActivityList = (list: Activity[]) => (
    <ol class="activity">
      {list.map((event) => (
        <li class="activity__item" key={event.id}>
          <span class="activity__rail" aria-hidden="true">
            <span class={`activity__dot activity__dot--${activityTone(event.kind)}`}>
              {renderIcon(activityIcon(event.kind), 14)}
            </span>
          </span>
          <div>
            <p class="activity__message">{event.message}</p>
            <p class="activity__meta">
              <span>{ACTIVITY_ACTOR}</span>
              <span aria-hidden="true">·</span>
              <span>{relativeTime(event.timestamp, nowDate.value)}</span>
              {event.vesselId && vesselNames.value[event.vesselId] ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{vesselNames.value[event.vesselId]}</span>
                </>
              ) : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );

  const renderQueuePanel = (list: Task[], total: number, compact: boolean) => {
    const loading = status.value === 'loading';
    return (
      <>
        <div class="queue-toolbar">
          <label class="search">
            <span class="sr-only">Search tasks by title, vessel, crew or category</span>
            {renderIcon('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5', 16)}
            <input
              type="search"
              value={query.value}
              placeholder="Search title, vessel, crew…"
              onInput$={(_, element) => {
                query.value = element.value;
              }}
              aria-label="Search tasks"
            />
            {query.value ? (
              <button
                class="search__clear"
                type="button"
                aria-label="Clear search"
                onClick$={() => {
                  query.value = '';
                }}
              >
                ×
              </button>
            ) : null}
          </label>
          <div class="chips" role="group" aria-label="Filter work queue">
            {FILTERS.map((item) => (
              <button
                class="chip"
                type="button"
                key={item.key}
                aria-pressed={filter.value === item.key ? 'true' : 'false'}
                onClick$={() => {
                  filter.value = item.key;
                }}
              >
                {item.label}
                <span class="chip__count">{filterCounts.value[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          renderSkeletonRows(compact ? 4 : 7)
        ) : list.length === 0 ? (
          tasks.value.length === 0 ? (
            renderState({
              tone: 'empty',
              title: 'No work orders yet',
              text: 'Log the first maintenance task and it will appear here for the whole crew.',
            })
          ) : (
            renderState({
              tone: 'empty',
              title: 'Nothing matches this view',
              text: 'Try another filter or clear the search to see the rest of the queue.',
              actionLabel: 'Clear filters',
              onAction: $(() => {
                query.value = '';
                filter.value = 'all';
              }),
            })
          )
        ) : (
          <ul class="task-list">{list.map((task) => renderTaskRow(task, compact))}</ul>
        )}
        <div class="panel__foot">
          <p class="panel__hint">
            Showing {list.length} of {total} work orders
            {filter.value !== 'all'
              ? ` · ${FILTERS.find((item) => item.key === filter.value)?.label}`
              : ''}
          </p>
        </div>
      </>
    );
  };

  const renderFleetPanel = (compact: boolean) => {
    const loading = status.value === 'loading';
    const list = fleet.value;
    const openAdd = $(() => {
      vesselError.value = '';
      vesselOpen.value = true;
    });

    return (
      <>
        {loading ? (
          <div class="fleet-strip" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div class="skeleton skeleton--card" key={index}></div>
            ))}
          </div>
        ) : list.length === 0 ? (
          renderState({
            tone: 'empty',
            title: 'No vessels in the marina yet',
            text: 'Add a vessel to start tracking berths, inspections and maintenance work.',
            actionLabel: 'Add the first vessel',
            onAction: openAdd,
          })
        ) : compact ? (
          <div class="fleet-strip">
            {list.map((vessel) => renderVesselCard(vessel, false))}
            <button class="vessel-card vessel-card--add" type="button" onClick$={openAdd}>
              {renderIcon('M12 5v14M5 12h14', 20)}
              <span>Add vessel</span>
            </button>
          </div>
        ) : (
          <div class="fleet-grid">
            {list.map((vessel) => renderVesselCard(vessel, true))}
            <button class="vessel-card vessel-card--add" type="button" onClick$={openAdd}>
              {renderIcon('M12 5v14M5 12h14', 20)}
              <span>Add vessel</span>
            </button>
          </div>
        )}
      </>
    );
  };

  /* -------------------------------------------------------------- markup */
  const activeTask = selectedTask.value;
  const activeToast = toast.value;
  const viewTitle =
    view.value === 'dashboard'
      ? 'Marina overview'
      : view.value === 'fleet'
        ? 'Fleet'
        : view.value === 'queue'
          ? 'Work queue'
          : 'Activity';
  const syncState =
    status.value === 'loading' ? 'loading' : status.value === 'error' ? 'error' : 'ok';
  const syncLabel =
    status.value === 'loading'
      ? 'Loading the API…'
      : status.value === 'error'
        ? 'API offline'
        : refreshing.value || syncing.value
          ? 'Syncing…'
          : lastSync.value
            ? `Synced ${timeFmt.format(new Date(lastSync.value))}`
            : 'Synced';

  return (
    <div class="app">
      <a class="skip-link" href="#harborlog-content">
        Skip to main content
      </a>

      <aside class="sidebar" aria-label="Harborlog">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">
            {renderIcon(
              'M12 3v6M5 9h14l-1.4 11.2a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8L5 9ZM9 19v-6M15 19v-6',
              22,
            )}
          </span>
          <span class="brand__text">
            <strong>Harborlog</strong>
            <small>Marina ops</small>
          </span>
        </div>

        <nav class="nav" aria-label="Workspace views">
          <p class="nav__label" id="nav-label">
            Workspace
          </p>
          {NAV.map((item) => {
            const count = navCount(item.key);
            return (
              <button
                type="button"
                key={item.key}
                class="nav__item"
                aria-current={view.value === item.key ? 'page' : undefined}
                aria-describedby={
                  item.key === 'dashboard' && overdueCount.value > 0
                    ? 'nav-overdue-note'
                    : undefined
                }
                onClick$={() => {
                  view.value = item.key;
                }}
              >
                {renderIcon(item.icon, 18)}
                <span>{item.label}</span>
                {count !== null ? (
                  <span class="nav__count" aria-label={`${count} items`}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
          <p class="sr-only" id="nav-overdue-note">
            {overdueCount.value} overdue work orders need attention.
          </p>
        </nav>

        <div class="sidebar__foot">
          <p class="sidebar__hint">
            <strong>{vessels.value.length || 'No'} vessels</strong> in the marina ·{' '}
            {tasks.value.filter((task) => !isDone(task.status)).length} open work orders
          </p>
          <button
            class="btn btn--ghost btn--block btn--sm"
            type="button"
            onClick$={refreshAll}
            disabled={refreshing.value}
          >
            {refreshing.value ? <span class="spinner" aria-hidden="true"></span> : null}
            Refresh data
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="topbar__lead">
            <p class="topbar__eyebrow">Harborlog · Marina operations</p>
            <h1 class="topbar__title">{viewTitle}</h1>
            <p class="topbar__sub">
              {formatLongDate(nowDate.value)} · {kpis.value.active} active work orders ·{' '}
              {overdueCount.value > 0 ? `${overdueCount.value} overdue` : 'nothing overdue'}
            </p>
          </div>
          <div class="topbar__actions">
            <span class="sync-pill" data-state={syncState} role="status" aria-live="polite">
              <span class="sync-pill__dot" aria-hidden="true"></span>
              {syncLabel}
            </span>
            <button
              class="btn btn--ghost"
              type="button"
              onClick$={refreshAll}
              disabled={refreshing.value}
              aria-label="Refresh dashboard data from the API"
            >
              {renderIcon('M20 11a8 8 0 1 0-2.3 5.6M20 5v6h-6', 16)}
              Refresh
            </button>
            <button
              class="btn btn--primary"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={createOpen.value ? 'true' : 'false'}
              onClick$={() => {
                createError.value = '';
                createOpen.value = true;
              }}
            >
              {renderIcon('M12 5v14M5 12h14', 16)}
              Log maintenance
            </button>
          </div>
        </header>

        <main class="content" id="harborlog-content" tabIndex={-1}>
          {status.value === 'error' ? (
            <section aria-label="Connection problem">
              {renderState({
                tone: 'error',
                title: 'The Harborlog API is unreachable',
                text:
                  loadError.value ||
                  'We could not load /api/dashboard, /api/vessels, /api/tasks and /api/activity. Start the Elysia server and retry.',
                actionLabel: 'Retry request',
                onAction: loadAll,
              })}
            </section>
          ) : null}

          {view.value === 'dashboard' ? (
            <section class="view" aria-labelledby="view-dashboard">
              <h2 class="sr-only" id="view-dashboard">
                Dashboard
              </h2>

              {status.value === 'loading' ? (
                renderSkeletonKpis()
              ) : (
                <div class="kpis">
                  <article class="kpi">
                    <p class="kpi__label">
                      <span class="kpi__glyph" aria-hidden="true">
                        {renderIcon('M4 6h16M4 12h10M4 18h16', 14)}
                      </span>
                      Active tasks
                    </p>
                    <p class="kpi__value">{kpis.value.active}</p>
                    <p class="kpi__hint">
                      Open across {vessels.value.length} vessels in the marina
                    </p>
                  </article>
                  <article class="kpi kpi--due">
                    <p class="kpi__label">
                      <span class="kpi__glyph" aria-hidden="true">
                        {renderIcon('M8 2v4M16 2v4M3 10h18M5 4h14v16H5z', 14)}
                      </span>
                      Due this week
                    </p>
                    <p class="kpi__value">{kpis.value.dueThisWeek}</p>
                    <p class="kpi__hint">Scheduled in the next seven days</p>
                  </article>
                  <article class="kpi kpi--overdue">
                    <p class="kpi__label">
                      <span class="kpi__glyph" aria-hidden="true">
                        {renderIcon('M12 8v5M12 16h.01M12 3l9 17H3z', 14)}
                      </span>
                      Overdue
                    </p>
                    <p class="kpi__value">{kpis.value.overdue}</p>
                    <p class="kpi__hint">
                      {kpis.value.overdue > 0
                        ? 'Past the due date — needs attention'
                        : 'Everything is on schedule'}
                    </p>
                  </article>
                  <article class="kpi kpi--rate">
                    <p class="kpi__label">
                      <span class="kpi__glyph" aria-hidden="true">
                        {renderIcon('M20 6 9 17l-5-5', 14)}
                      </span>
                      Completion rate
                    </p>
                    <p class="kpi__value">{kpis.value.completionRate}%</p>
                    <div
                      class="kpi__meter"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={kpis.value.completionRate}
                      aria-label="Share of work orders completed"
                    >
                      <span style={`width: ${kpis.value.completionRate}%`}></span>
                    </div>
                    <p class="kpi__hint">
                      {kpis.value.completed} of {kpis.value.total} work orders closed
                      {kpis.value.completedThisMonth > 0
                        ? ` · ${kpis.value.completedThisMonth} this month`
                        : ''}
                    </p>
                  </article>
                </div>
              )}

              <section class="panel" aria-labelledby="panel-fleet">
                <header class="panel__head">
                  <h2 class="panel__title" id="panel-fleet">
                    Fleet
                    <span class="panel__count">{fleet.value.length}</span>
                  </h2>
                  <div class="panel__actions">
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      onClick$={() => {
                        view.value = 'fleet';
                      }}
                    >
                      Open fleet
                    </button>
                  </div>
                </header>
                {renderFleetPanel(true)}
              </section>

              <section class="panel" aria-labelledby="panel-queue">
                <header class="panel__head">
                  <h2 class="panel__title" id="panel-queue">
                    Work queue
                    <span class="panel__count">{queue.value.length}</span>
                  </h2>
                  <div class="panel__actions">
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      onClick$={() => {
                        view.value = 'queue';
                      }}
                    >
                      Open work queue
                    </button>
                  </div>
                </header>
                {renderQueuePanel(queue.value.slice(0, 6), tasks.value.length, true)}
              </section>

              <section class="panel" aria-labelledby="panel-activity">
                <header class="panel__head">
                  <h2 class="panel__title" id="panel-activity">
                    Recent activity
                    <span class="panel__count">{events.value.length}</span>
                  </h2>
                  <div class="panel__actions">
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      onClick$={() => {
                        view.value = 'activity';
                      }}
                    >
                      View all
                    </button>
                  </div>
                </header>
                {status.value === 'loading'
                  ? renderSkeletonRows(3)
                  : recentEvents.value.length === 0
                    ? renderState({
                        tone: 'empty',
                        title: 'No dockside activity yet',
                        text: 'Creating, updating or completing a task will record an entry here.',
                      })
                    : renderActivityList(recentEvents.value)}
              </section>
            </section>
          ) : null}

          {view.value === 'fleet' ? (
            <section class="view" aria-labelledby="view-fleet">
              <div class="view__intro">
                <div>
                  <h2 class="view__title" id="view-fleet">
                    Fleet
                  </h2>
                  <p class="view__copy">
                    Berths, service state and next inspection for every hull in the marina. Change a
                    service status to keep the dock crew aligned.
                  </p>
                </div>
                <button
                  class="btn btn--ghost"
                  type="button"
                  onClick$={() => {
                    vesselError.value = '';
                    vesselOpen.value = true;
                  }}
                >
                  {renderIcon('M12 5v14M5 12h14', 16)}
                  Add vessel
                </button>
              </div>
              <section class="panel" aria-label="Vessels">
                {renderFleetPanel(false)}
              </section>
            </section>
          ) : null}

          {view.value === 'queue' ? (
            <section class="view" aria-labelledby="view-queue">
              <div class="view__intro">
                <div>
                  <h2 class="view__title" id="view-queue">
                    Work queue
                  </h2>
                  <p class="view__copy">
                    Every maintenance task in one list — search it, filter it, and open a row for
                    the full dock-side detail.
                  </p>
                </div>
                <button
                  class="btn btn--ghost"
                  type="button"
                  onClick$={() => {
                    createError.value = '';
                    createOpen.value = true;
                  }}
                >
                  {renderIcon('M12 5v14M5 12h14', 16)}
                  Log maintenance
                </button>
              </div>
              <section class="panel" aria-label="Work queue">
                {renderQueuePanel(queue.value, tasks.value.length, false)}
              </section>
            </section>
          ) : null}

          {view.value === 'activity' ? (
            <section class="view" aria-labelledby="view-activity">
              <div class="view__intro">
                <div>
                  <h2 class="view__title" id="view-activity">
                    Activity
                  </h2>
                  <p class="view__copy">
                    A running log of what changed in the marina — newest first.
                  </p>
                </div>
              </div>
              <section class="panel" aria-label="Activity log">
                {status.value === 'loading'
                  ? renderSkeletonRows(5)
                  : events.value.length === 0
                    ? renderState({
                        tone: 'empty',
                        title: 'Nothing logged yet',
                        text: 'Activity appears here as soon as your crew creates or completes work.',
                      })
                    : renderActivityList(
                        [...events.value].sort(
                          (a, b) =>
                            (parseDate(b.timestamp)?.getTime() ?? 0) -
                            (parseDate(a.timestamp)?.getTime() ?? 0),
                        ),
                      )}
              </section>
            </section>
          ) : null}
        </main>
      </div>

      {activeTask ? (
        <div
          class="overlay overlay--drawer"
          role="presentation"
          onClick$={(event, element) => {
            if (event.target === element) closeDrawer();
          }}
        >
          <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title">
            <header class="drawer__head">
              <div>
                <p class="drawer__eyebrow">
                  {categoryLabel(activeTask.category)} ·{' '}
                  {vesselNames.value[activeTask.vesselId] ?? 'Unassigned vessel'}
                </p>
                <h2 class="drawer__title" id="task-drawer-title">
                  {activeTask.title}
                </h2>
                <p class="drawer__sub">
                  <span
                    class={dueClass(
                      dueInfo(activeTask.dueDate, activeTask.status, nowDate.value).tone,
                    )}
                  >
                    {dueInfo(activeTask.dueDate, activeTask.status, nowDate.value).text}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{statusMeta(activeTask.status).label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeTask.assignee}</span>
                </p>
              </div>
              <button
                class="btn btn--icon"
                type="button"
                aria-label="Close task details"
                onClick$={closeDrawer}
              >
                {renderIcon('M6 6l12 12M18 6 6 18', 16)}
              </button>
            </header>

            <div class="drawer__body">
              <dl class="detail-grid">
                <div>
                  <dt>Vessel</dt>
                  <dd>{vesselNames.value[activeTask.vesselId] ?? 'Unassigned'}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{formatDate(activeTask.dueDate)}</dd>
                </div>
                <div>
                  <dt>Estimate</dt>
                  <dd>{formatHours(activeTask.estimatedHours)}</dd>
                </div>
                <div>
                  <dt>Logged</dt>
                  <dd>{formatStamp(activeTask.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatStamp(activeTask.updatedAt)}</dd>
                </div>
              </dl>

              <div class="block">
                <p class="block__title" id="status-group-label">
                  Status
                </p>
                <div class="segmented" role="group" aria-labelledby="status-group-label">
                  {STATUS_ORDER.map((option) => (
                    <button
                      class="segmented__btn"
                      type="button"
                      key={option}
                      aria-pressed={activeTask.status === option ? 'true' : 'false'}
                      disabled={busyTaskId.value === activeTask.id && busyAction.value === 'patch'}
                      onClick$={() =>
                        patchTask(
                          activeTask.id,
                          { status: option },
                          `Moved to ${statusMeta(option).label.toLowerCase()}`,
                        )
                      }
                    >
                      <span aria-hidden="true">{statusMeta(option).glyph}</span>{' '}
                      {statusMeta(option).label}
                    </button>
                  ))}
                </div>
              </div>

              <div class="block">
                <label class="field__label" for="task-priority">
                  Priority
                </label>
                <select
                  class="field__input"
                  id="task-priority"
                  value={activeTask.priority}
                  onChange$={(_, element) => {
                    const next = element.value as TaskPriority;
                    if (next !== activeTask.priority) {
                      patchTask(
                        activeTask.id,
                        { priority: next },
                        `Priority set to ${priorityMeta(next).label}`,
                      );
                    }
                  }}
                >
                  {PRIORITY_ORDER.map((option) => (
                    <option value={option} key={option} selected={option === activeTask.priority}>
                      {priorityMeta(option).label}
                    </option>
                  ))}
                </select>
              </div>

              <div class="block">
                <div class="block__title">
                  <span id="parts-group-label">Parts checklist</span>
                  <span class="panel__count">
                    {activeTask.parts.filter((part) => part.checked).length}/
                    {activeTask.parts.length} checked
                  </span>
                </div>
                {activeTask.parts.length === 0 ? (
                  <p class="panel__hint">
                    No parts listed. Add the parts you need so the dock crew can stage them.
                  </p>
                ) : (
                  <ul class="parts" aria-labelledby="parts-group-label">
                    {activeTask.parts.map((part) => (
                      <li class={`part${part.checked ? ' part--ready' : ''}`} key={part.id}>
                        <button
                          class="part__toggle"
                          type="button"
                          aria-pressed={part.checked ? 'true' : 'false'}
                          aria-label={
                            part.checked
                              ? `Mark ${part.name} as not checked`
                              : `Mark ${part.name} as checked`
                          }
                          onClick$={() => togglePart(activeTask.id, part.id, !part.checked)}
                        >
                          {renderIcon('M20 6 9 17l-5-5', 14)}
                        </button>
                        <span class="part__body">
                          <span class="part__name">{part.name}</span>
                          <span class="part__meta">
                            Qty {part.quantity} · {part.checked ? 'Checked' : 'Not checked'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  class="part-form"
                  onSubmit$={(event, element) => {
                    event.preventDefault();
                    submitPart(activeTask.id, element as HTMLFormElement);
                  }}
                >
                  <input
                    class="field__input"
                    name="partName"
                    type="text"
                    placeholder="Add a part…"
                    aria-label="New part name"
                    ref={partNameRef}
                  />
                  <input
                    class="field__input"
                    name="partQuantity"
                    type="number"
                    min="1"
                    value="1"
                    aria-label="Part quantity"
                    style="max-width: 96px"
                  />
                  <button class="btn btn--ghost" type="submit">
                    Add part
                  </button>
                </form>
              </div>

              <div class="block">
                <label class="field__label" for="task-notes">
                  Notes
                </label>
                <textarea
                  class="field__input"
                  id="task-notes"
                  ref={notesRef}
                  placeholder="Torque values, supplier, what the next crew should check…"
                ></textarea>
                <div class="field__hint">
                  Notes save to the work order and appear on the next shift handover.
                </div>
                <div class="panel__actions">
                  <button
                    class="btn btn--ghost btn--sm"
                    type="button"
                    disabled={busyAction.value === 'notes'}
                    onClick$={() => saveNotes(activeTask.id, notesRef.value?.value ?? '')}
                  >
                    {busyAction.value === 'notes' ? (
                      <span class="spinner" aria-hidden="true"></span>
                    ) : null}
                    Save notes
                  </button>
                </div>
              </div>
            </div>

            <footer class="drawer__foot">
              {confirmDelete.value ? (
                <>
                  <span class="panel__hint">
                    Delete “{activeTask.title}”? This cannot be undone.
                  </span>
                  <div class="panel__actions">
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      onClick$={() => {
                        confirmDelete.value = false;
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      class="btn btn--danger btn--sm"
                      type="button"
                      disabled={busyTaskId.value === activeTask.id && busyAction.value === 'delete'}
                      onClick$={() => deleteTask(activeTask.id)}
                    >
                      Delete task
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    class="btn btn--quiet btn--sm"
                    type="button"
                    onClick$={() => {
                      confirmDelete.value = true;
                    }}
                  >
                    Delete task
                  </button>
                  <div class="panel__actions">
                    {isDone(activeTask.status) ? null : (
                      <button
                        class="btn btn--primary btn--sm"
                        type="button"
                        disabled={busyTaskId.value === activeTask.id}
                        onClick$={() =>
                          patchTask(activeTask.id, { status: 'complete' }, 'Task marked complete')
                        }
                      >
                        {renderIcon('M20 6 9 17l-5-5', 14)}
                        Mark complete
                      </button>
                    )}
                    <button class="btn btn--ghost btn--sm" type="button" onClick$={closeDrawer}>
                      Close
                    </button>
                  </div>
                </>
              )}
            </footer>
          </aside>
        </div>
      ) : null}

      {createOpen.value ? (
        <div
          class="overlay overlay--modal"
          role="presentation"
          onClick$={(event, element) => {
            if (event.target === element) createOpen.value = false;
          }}
        >
          <form
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
            onSubmit$={(event, element) => {
              event.preventDefault();
              createTask(element as HTMLFormElement);
            }}
          >
            <header class="modal__head">
              <div>
                <p class="drawer__eyebrow">New work order</p>
                <h2 class="modal__title" id="create-task-title">
                  Log maintenance
                </h2>
              </div>
              <button
                class="btn btn--icon"
                type="button"
                aria-label="Close the log maintenance dialog"
                onClick$={() => {
                  createOpen.value = false;
                }}
              >
                {renderIcon('M6 6l12 12M18 6 6 18', 16)}
              </button>
            </header>
            <div class="modal__body">
              {createError.value ? (
                <p class="field__error" role="alert">
                  {createError.value}
                </p>
              ) : null}
              <div class="form-grid">
                <label class="field form-grid--full">
                  <span class="field__label">Vessel</span>
                  <select class="field__input" name="vesselId" required>
                    <option value="">Select a vessel…</option>
                    {fleet.value.map((vessel) => (
                      <option value={vessel.id} key={vessel.id}>
                        {vessel.berth ? `${vessel.name} · berth ${vessel.berth}` : vessel.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field form-grid--full">
                  <span class="field__label">Task title</span>
                  <input
                    class="field__input"
                    name="title"
                    type="text"
                    placeholder="Replace raw-water impeller"
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Category</span>
                  <select class="field__input" name="category" value="engine">
                    {CATEGORY_ORDER.map((option) => (
                      <option value={option} key={option}>
                        {categoryLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="field__label">Priority</span>
                  <select class="field__input" name="priority" value="medium">
                    {PRIORITY_ORDER.map((option) => (
                      <option value={option} key={option}>
                        {priorityMeta(option).label}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="field__label">Due date</span>
                  <input
                    class="field__input"
                    name="dueDate"
                    type="date"
                    value={toDateInput(new Date(clock.value + 7 * DAY_MS))}
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Assignee</span>
                  <input
                    class="field__input"
                    name="assignee"
                    type="text"
                    placeholder="Dock crew name"
                  />
                </label>
                <label class="field">
                  <span class="field__label">Estimate (hours)</span>
                  <input
                    class="field__input"
                    name="estimatedHours"
                    type="number"
                    min="0"
                    step="0.5"
                    value="2"
                  />
                </label>
                <label class="field form-grid--full">
                  <span class="field__label">Notes</span>
                  <textarea
                    class="field__input"
                    name="notes"
                    placeholder="Symptoms, parts on order, access notes…"
                  ></textarea>
                </label>
              </div>
            </div>
            <footer class="modal__foot">
              <button
                class="btn btn--ghost"
                type="button"
                onClick$={() => {
                  createOpen.value = false;
                }}
              >
                Cancel
              </button>
              <button class="btn btn--primary" type="submit" disabled={createSubmitting.value}>
                {createSubmitting.value ? <span class="spinner" aria-hidden="true"></span> : null}
                {createSubmitting.value ? 'Saving…' : 'Create task'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {vesselOpen.value ? (
        <div
          class="overlay overlay--modal"
          role="presentation"
          onClick$={(event, element) => {
            if (event.target === element) vesselOpen.value = false;
          }}
        >
          <form
            class="modal modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-vessel-title"
            onSubmit$={(event, element) => {
              event.preventDefault();
              createVessel(element as HTMLFormElement);
            }}
          >
            <header class="modal__head">
              <div>
                <p class="drawer__eyebrow">Fleet</p>
                <h2 class="modal__title" id="create-vessel-title">
                  Add vessel
                </h2>
              </div>
              <button
                class="btn btn--icon"
                type="button"
                aria-label="Close the add vessel dialog"
                onClick$={() => {
                  vesselOpen.value = false;
                }}
              >
                {renderIcon('M6 6l12 12M18 6 6 18', 16)}
              </button>
            </header>
            <div class="modal__body">
              {vesselError.value ? (
                <p class="field__error" role="alert">
                  {vesselError.value}
                </p>
              ) : null}
              <div class="form-grid">
                <label class="field form-grid--full">
                  <span class="field__label">Vessel name</span>
                  <input
                    class="field__input"
                    name="name"
                    type="text"
                    placeholder="Sea Wren"
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Model</span>
                  <input
                    class="field__input"
                    name="model"
                    type="text"
                    placeholder="Beneteau Oceanis 41"
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Berth</span>
                  <input
                    class="field__input"
                    name="berth"
                    type="text"
                    placeholder="B-14"
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Owner</span>
                  <input
                    class="field__input"
                    name="owner"
                    type="text"
                    placeholder="Dana Whitfield"
                    required
                  />
                </label>
                <label class="field">
                  <span class="field__label">Next inspection</span>
                  <input class="field__input" name="nextInspection" type="date" />
                </label>
              </div>
            </div>
            <footer class="modal__foot">
              <button
                class="btn btn--ghost"
                type="button"
                onClick$={() => {
                  vesselOpen.value = false;
                }}
              >
                Cancel
              </button>
              <button class="btn btn--primary" type="submit" disabled={vesselSubmitting.value}>
                {vesselSubmitting.value ? <span class="spinner" aria-hidden="true"></span> : null}
                {vesselSubmitting.value ? 'Adding…' : 'Add vessel'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {activeToast ? (
        <div class="toast-stack" role="status" aria-live="polite">
          <div class={`toast toast--${activeToast.tone}`}>
            <span class="toast__icon" aria-hidden="true">
              {activeToast.tone === 'error' ? '!' : activeToast.tone === 'success' ? '✓' : 'i'}
            </span>
            <div class="toast__body">
              <p class="toast__title">{activeToast.title}</p>
              {activeToast.text ? <p class="toast__text">{activeToast.text}</p> : null}
            </div>
            <button
              class="toast__close"
              type="button"
              aria-label="Dismiss notification"
              onClick$={() => {
                toast.value = null;
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default Harborlog;

/** Formats a Date as the `yyyy-mm-dd` value an `<input type="date">` expects. */
function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
