import { describe, expect, it } from 'vitest';
import type { Activity, Dashboard, Part, Task, Vessel } from '../shared/types';
import { createApp } from './app';

type HarborApp = ReturnType<typeof createApp>;

const VESSEL_STATUSES: readonly Vessel['status'][] = ['ready', 'attention', 'hauled'];
const TASK_STATUSES: readonly Task['status'][] = ['scheduled', 'in-progress', 'complete'];
const TASK_PRIORITIES: readonly Task['priority'][] = ['low', 'medium', 'high'];

interface ApiResult<T> {
  status: number;
  body: T;
}

interface ApiError {
  error: string;
}

async function api<T>(
  app: HarborApp,
  method: string,
  path: string,
  payload?: unknown,
): Promise<ApiResult<T>> {
  const init: RequestInit = { method };

  if (payload !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(payload);
  }

  const response = await app.handle(new Request(`http://harborlog.test${path}`, init));
  const body = (await response.json()) as T;

  return { status: response.status, body };
}

async function listVessels(app: HarborApp): Promise<Vessel[]> {
  const { status, body } = await api<Vessel[]>(app, 'GET', '/api/vessels');
  expect(status).toBe(200);
  return body;
}

async function listTasks(app: HarborApp, query = ''): Promise<Task[]> {
  const { status, body } = await api<Task[]>(app, 'GET', `/api/tasks${query}`);
  expect(status).toBe(200);
  return body;
}

async function readDashboard(app: HarborApp): Promise<Dashboard> {
  const { status, body } = await api<Dashboard>(app, 'GET', '/api/dashboard');
  expect(status).toBe(200);
  return body;
}

async function listActivity(app: HarborApp): Promise<Activity[]> {
  const { status, body } = await api<Activity[]>(app, 'GET', '/api/activity');
  expect(status).toBe(200);
  return body;
}

interface NewTaskInput {
  vesselId: string;
  title: string;
  category: Task['category'];
  priority: Task['priority'];
  dueDate: string;
  assignee: string;
  estimatedHours?: number;
  notes?: string;
}

async function createTask(app: HarborApp, overrides: Partial<NewTaskInput> = {}): Promise<Task> {
  const vessels = await listVessels(app);
  const payload: NewTaskInput = {
    vesselId: vessels[0].id,
    title: 'Replace the raw-water impeller',
    category: 'engine',
    priority: 'high',
    dueDate: '2026-09-30',
    assignee: 'Rosa Meyer',
    estimatedHours: 3,
    notes: 'Spares staged in the dock box.',
    ...overrides,
  };
  const { status, body } = await api<Task>(app, 'POST', '/api/tasks', payload);
  expect(status).toBe(201);
  return body;
}

describe('GET /api/health', () => {
  it('reports the service as ok', async () => {
    const app = createApp();
    const { status, body } = await api<{ status: string; service: string }>(
      app,
      'GET',
      '/api/health',
    );

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('harborlog');
  });
});

describe('GET /api/dashboard', () => {
  it('summarizes the seeded fleet, task load, and activity', async () => {
    const app = createApp();
    const dashboard = await readDashboard(app);

    expect(dashboard.totalVessels).toBeGreaterThanOrEqual(5);
    expect(typeof dashboard.activeTasks).toBe('number');
    expect(typeof dashboard.dueThisWeek).toBe('number');
    expect(typeof dashboard.overdue).toBe('number');
    expect(typeof dashboard.completedThisMonth).toBe('number');
    expect(typeof dashboard.completionRate).toBe('number');
    expect(Number.isFinite(dashboard.completionRate)).toBe(true);
    expect(dashboard.completionRate).toBeGreaterThanOrEqual(0);
    expect(dashboard.activeTasks).toBeGreaterThan(0);
    expect(dashboard.recentActivity.length).toBeGreaterThan(0);
    expect(Array.isArray(dashboard.upcoming)).toBe(true);
  });

  it('keeps the vessel total consistent with the vessel list', async () => {
    const app = createApp();
    const dashboard = await readDashboard(app);
    const vessels = await listVessels(app);

    expect(dashboard.totalVessels).toBe(vessels.length);
  });
});

describe('GET /api/vessels', () => {
  it('returns the seeded fleet with usable records', async () => {
    const app = createApp();
    const vessels = await listVessels(app);

    expect(vessels.length).toBeGreaterThanOrEqual(5);

    for (const vessel of vessels) {
      expect(vessel.id).toBeTruthy();
      expect(vessel.name).toBeTruthy();
      expect(vessel.model).toBeTruthy();
      expect(vessel.berth).toBeTruthy();
      expect(vessel.owner).toBeTruthy();
      expect(VESSEL_STATUSES).toContain(vessel.status);
      expect(typeof vessel.lastServiced).toBe('string');
      expect(typeof vessel.nextInspection).toBe('string');
      expect(vessel.accent).toBeTruthy();
    }

    expect(new Set(vessels.map((vessel) => vessel.status))).toEqual(new Set(VESSEL_STATUSES));
  });
});

describe('POST /api/vessels', () => {
  it('creates a vessel that shows up in later listings', async () => {
    const app = createApp();
    const before = await readDashboard(app);
    const { status, body } = await api<Vessel>(app, 'POST', '/api/vessels', {
      name: 'Sundial',
      model: 'Contessa 32',
      berth: 'D-12',
      owner: 'Priya Nair',
    });

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('Sundial');
    expect(body.model).toBe('Contessa 32');
    expect(body.berth).toBe('D-12');
    expect(body.owner).toBe('Priya Nair');
    expect(VESSEL_STATUSES).toContain(body.status);

    const vessels = await listVessels(app);
    expect(vessels.some((vessel) => vessel.id === body.id && vessel.name === 'Sundial')).toBe(true);

    const after = await readDashboard(app);
    expect(after.totalVessels).toBe(before.totalVessels + 1);
  });

  it('rejects a vessel that is missing required fields', async () => {
    const app = createApp();
    const { status, body } = await api<ApiError>(app, 'POST', '/api/vessels', { name: 'Sundial' });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });
});

describe('PATCH /api/vessels/:id', () => {
  it('updates vessel details', async () => {
    const app = createApp();
    const [vessel] = await listVessels(app);
    const { status, body } = await api<Vessel>(app, 'PATCH', `/api/vessels/${vessel.id}`, {
      status: 'hauled',
      berth: 'C-02',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('hauled');
    expect(body.berth).toBe('C-02');

    const vessels = await listVessels(app);
    expect(vessels.find((entry) => entry.id === vessel.id)?.status).toBe('hauled');
  });

  it('returns 404 for an unknown vessel', async () => {
    const app = createApp();
    const { status, body } = await api<ApiError>(app, 'PATCH', '/api/vessels/vessel-missing', {
      status: 'ready',
    });

    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('GET /api/tasks filters', () => {
  it('returns the seeded work queue', async () => {
    const app = createApp();
    const tasks = await listTasks(app);

    expect(tasks.length).toBeGreaterThanOrEqual(7);
    expect(new Set(tasks.map((task) => task.status))).toEqual(new Set(TASK_STATUSES));
    expect(new Set(tasks.map((task) => task.priority))).toEqual(new Set(TASK_PRIORITIES));
    expect(tasks.some((task) => task.parts.length > 0)).toBe(true);

    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(task.vesselId).toBeTruthy();
      expect(Array.isArray(task.parts)).toBe(true);
    }
  });

  it('filters by status and treats "all" as unfiltered', async () => {
    const app = createApp();
    const tasks = await listTasks(app);
    const all = await listTasks(app, '?status=all');

    expect(all.map((task) => task.id).sort()).toEqual(tasks.map((task) => task.id).sort());

    for (const status of TASK_STATUSES) {
      const filtered = await listTasks(app, `?status=${status}`);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((task) => task.status === status)).toBe(true);
    }
  });

  it('filters by vessel', async () => {
    const app = createApp();
    const tasks = await listTasks(app);
    const target = tasks[0];
    const filtered = await listTasks(app, `?vesselId=${target.vesselId}`);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((task) => task.vesselId === target.vesselId)).toBe(true);
    expect(filtered.some((task) => task.id === target.id)).toBe(true);
  });

  it('searches task text case-insensitively', async () => {
    const app = createApp();
    const created = await createTask(app, { title: 'Torque the keel bolts' });

    const matches = await listTasks(app, '?q=TORQUE');
    expect(matches.some((task) => task.id === created.id)).toBe(true);

    const missing = await listTasks(app, '?q=no-such-maintenance-term');
    expect(missing).toEqual([]);
  });
});

describe('task lifecycle', () => {
  it('creates a task for an existing vessel', async () => {
    const app = createApp();
    const [vessel] = await listVessels(app);
    const before = await listTasks(app);
    const created = await createTask(app, { vesselId: vessel.id });

    expect(created.id).toBeTruthy();
    expect(created.vesselId).toBe(vessel.id);
    expect(created.title).toBeTruthy();
    expect(TASK_STATUSES).toContain(created.status);
    expect(Array.isArray(created.parts)).toBe(true);

    const after = await listTasks(app);
    expect(after.length).toBe(before.length + 1);
    expect(after.some((task) => task.id === created.id)).toBe(true);
  });

  it('completes a task and refreshes dashboard completion metrics', async () => {
    const app = createApp();
    const before = await readDashboard(app);
    const created = await createTask(app);
    const afterCreate = await readDashboard(app);

    expect(afterCreate.activeTasks).toBe(before.activeTasks + 1);

    const { status, body } = await api<Task>(app, 'PATCH', `/api/tasks/${created.id}`, {
      status: 'complete',
    });

    expect(status).toBe(200);
    expect(body.id).toBe(created.id);
    expect(body.status).toBe('complete');

    const completed = await listTasks(app, '?status=complete');
    expect(completed.some((task) => task.id === created.id)).toBe(true);

    const afterComplete = await readDashboard(app);
    expect(afterComplete.activeTasks).toBe(before.activeTasks);
    expect(afterComplete.completedThisMonth).toBe(before.completedThisMonth + 1);
  });

  it('updates task details with PATCH', async () => {
    const app = createApp();
    const created = await createTask(app);
    const { status, body } = await api<Task>(app, 'PATCH', `/api/tasks/${created.id}`, {
      title: 'Replace both raw-water impellers',
      priority: 'low',
      notes: 'Spare impeller returned to the ships store.',
    });

    expect(status).toBe(200);
    expect(body.title).toBe('Replace both raw-water impellers');
    expect(body.priority).toBe('low');
    expect(body.notes).toBe('Spare impeller returned to the ships store.');
    expect(body.status).toBe(created.status);
  });

  it('rejects an invalid task status update', async () => {
    const app = createApp();
    const created = await createTask(app);
    const { status, body } = await api<ApiError>(app, 'PATCH', `/api/tasks/${created.id}`, {
      status: 'finished',
    });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('returns 404 for an unknown task', async () => {
    const app = createApp();
    const patched = await api<ApiError>(app, 'PATCH', '/api/tasks/task-does-not-exist', {
      status: 'complete',
    });
    expect(patched.status).toBe(404);
    expect(patched.body.error).toBeTruthy();

    const removed = await api<ApiError>(app, 'DELETE', '/api/tasks/task-does-not-exist');
    expect(removed.status).toBe(404);
    expect(removed.body.error).toBeTruthy();
  });
});

describe('task parts', () => {
  it('adds a part and toggles it checked', async () => {
    const app = createApp();
    const created = await createTask(app);
    const added = await api<Part>(app, 'POST', `/api/tasks/${created.id}/parts`, {
      name: 'Impeller gasket',
      quantity: 2,
    });

    expect(added.status).toBe(201);
    expect(added.body.id).toBeTruthy();
    expect(added.body.name).toBe('Impeller gasket');
    expect(added.body.quantity).toBe(2);
    expect(added.body.checked).toBe(false);

    const withPart = (await listTasks(app)).find((task) => task.id === created.id);
    expect(withPart?.parts.some((part) => part.id === added.body.id)).toBe(true);

    const checked = await api<Part>(
      app,
      'PATCH',
      `/api/tasks/${created.id}/parts/${added.body.id}`,
      {
        checked: true,
      },
    );

    expect(checked.status).toBe(200);
    expect(checked.body.checked).toBe(true);

    const refreshed = (await listTasks(app)).find((task) => task.id === created.id);
    expect(refreshed?.parts.find((part) => part.id === added.body.id)?.checked).toBe(true);
  });

  it('returns 404 when checking an unknown part', async () => {
    const app = createApp();
    const created = await createTask(app);
    const { status, body } = await api<ApiError>(
      app,
      'PATCH',
      `/api/tasks/${created.id}/parts/part-does-not-exist`,
      { checked: true },
    );

    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('removes a task from the work queue', async () => {
    const app = createApp();
    const created = await createTask(app);
    const { status, body } = await api<{ ok: boolean }>(app, 'DELETE', `/api/tasks/${created.id}`);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const tasks = await listTasks(app);
    expect(tasks.some((task) => task.id === created.id)).toBe(false);
  });
});

describe('GET /api/activity', () => {
  it('lists the newest maintenance activity first', async () => {
    const app = createApp();
    const activity = await listActivity(app);

    expect(activity.length).toBeGreaterThan(0);

    for (let index = 1; index < activity.length; index += 1) {
      expect(Date.parse(activity[index - 1].timestamp)).toBeGreaterThanOrEqual(
        Date.parse(activity[index].timestamp),
      );
    }
  });

  it('records an event when a task is created', async () => {
    const app = createApp();
    const created = await createTask(app);
    const activity = await listActivity(app);

    expect(
      activity.some(
        (entry) => entry.taskId === created.id || entry.message.includes(created.title),
      ),
    ).toBe(true);
  });
});

describe('create validation', () => {
  it('rejects a malformed task payload', async () => {
    const app = createApp();
    const { status, body } = await api<ApiError>(app, 'POST', '/api/tasks', {});

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rejects a task for an unknown vessel', async () => {
    const app = createApp();
    const { status, body } = await api<ApiError>(app, 'POST', '/api/tasks', {
      vesselId: 'vessel-does-not-exist',
      title: 'Inspect the standing rigging',
      category: 'rigging',
      priority: 'medium',
      dueDate: '2026-10-02',
      assignee: 'Tomas Berg',
    });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });
});
