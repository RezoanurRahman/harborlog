import { describe, expect, it } from 'vitest';
import { DEMO_NOW_ISO, DEMO_TODAY } from '../shared/types';
import { HarborStore } from './store';

const DAY_MS = 86_400_000;
const DEMO_WEEK_END = new Date(Date.parse(DEMO_NOW_ISO) + 7 * DAY_MS).toISOString().slice(0, 10);

const dueDay = (dueDate: string): string => dueDate.slice(0, 10);

describe('HarborStore seed data', () => {
  it('ships five believable vessels', () => {
    const store = new HarborStore();
    const vessels = store.listVessels();

    expect(vessels).toHaveLength(5);
    expect(new Set(vessels.map((vessel) => vessel.id)).size).toBe(5);
    expect(new Set(vessels.map((vessel) => vessel.status))).toEqual(
      new Set(['ready', 'attention', 'hauled']),
    );

    for (const vessel of vessels) {
      expect(vessel.name).toBeTruthy();
      expect(vessel.model).toBeTruthy();
      expect(vessel.berth).toBeTruthy();
      expect(vessel.owner).toBeTruthy();
      expect(vessel.lastServiced).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(vessel.nextInspection).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(vessel.accent).toMatch(/^#/);
    }
  });

  it('ships a work queue covering every workflow state', () => {
    const store = new HarborStore();
    const tasks = store.listTasks();
    const vesselIds = new Set(store.listVessels().map((vessel) => vessel.id));

    expect(tasks.length).toBeGreaterThanOrEqual(7);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
    expect(new Set(tasks.map((task) => task.status))).toEqual(
      new Set(['scheduled', 'in-progress', 'complete']),
    );
    expect(new Set(tasks.map((task) => task.priority))).toEqual(new Set(['low', 'medium', 'high']));
    expect(new Set(tasks.map((task) => task.category))).toEqual(
      new Set(['engine', 'hull', 'safety', 'electrical', 'rigging']),
    );
    expect(tasks.some((task) => task.parts.length > 0)).toBe(true);
    expect(tasks.some((task) => task.parts.some((part) => part.checked))).toBe(true);
    expect(
      tasks.some((task) => task.status !== 'complete' && dueDay(task.dueDate) < DEMO_TODAY),
    ).toBe(true);

    for (const task of tasks) {
      expect(vesselIds.has(task.vesselId)).toBe(true);
      expect(task.title).toBeTruthy();
      expect(task.assignee).toBeTruthy();
      expect(typeof task.estimatedHours).toBe('number');
      expect(Date.parse(task.createdAt)).not.toBeNaN();
      expect(Date.parse(task.updatedAt)).not.toBeNaN();
    }
  });

  it('builds the same deterministic data for every fresh store', () => {
    const first = new HarborStore();
    const second = new HarborStore();

    expect(second.listVessels()).toEqual(first.listVessels());
    expect(second.listTasks()).toEqual(first.listTasks());
    expect(second.listActivity()).toEqual(first.listActivity());
  });
});

describe('HarborStore lookups', () => {
  it('finds records by id', () => {
    const store = new HarborStore();
    const vessel = store.listVessels()[0];
    const task = store.listTasks()[0];

    expect(store.getVessel(vessel.id)?.name).toBe(vessel.name);
    expect(store.getTask(task.id)?.title).toBe(task.title);
    expect(store.getTask(task.id)?.vesselId).toBe(task.vesselId);
  });

  it('returns undefined or false for unknown ids', () => {
    const store = new HarborStore();

    expect(store.getVessel('v-missing')).toBeUndefined();
    expect(store.getTask('t-missing')).toBeUndefined();
    expect(store.updateVessel('v-missing', { status: 'hauled' })).toBeUndefined();
    expect(store.updateTask('t-missing', { status: 'complete' })).toBeUndefined();
    expect(store.updatePart('t-missing', 'p-01', { checked: true })).toBeUndefined();
    expect(store.addPart('t-missing', { name: 'Gasket' })).toBeUndefined();
    expect(store.deleteTask('t-missing')).toBe(false);
  });

  it('hands out copies so callers cannot mutate stored state', () => {
    const store = new HarborStore();
    const vessel = store.listVessels()[0];
    const task = store.listTasks()[0];

    vessel.name = 'Mutated Ashore';
    task.title = 'Mutated task';
    task.parts.push({ id: 'p-injected', name: 'Injected', quantity: 1, checked: false });

    expect(store.getVessel(vessel.id)?.name).not.toBe('Mutated Ashore');
    expect(store.getTask(task.id)?.title).not.toBe('Mutated task');
    expect(store.getTask(task.id)?.parts.some((part) => part.id === 'p-injected')).toBe(false);
  });
});

describe('HarborStore activity feed', () => {
  it('lists the newest activity first', () => {
    const store = new HarborStore();
    const activity = store.listActivity();

    expect(activity.length).toBeGreaterThan(0);

    for (let index = 1; index < activity.length; index += 1) {
      expect(Date.parse(activity[index - 1].timestamp)).toBeGreaterThanOrEqual(
        Date.parse(activity[index].timestamp),
      );
    }
  });

  it('records task and part events as they happen', () => {
    const store = new HarborStore();
    const vessel = store.listVessels()[0];
    const task = store.createTask({
      vesselId: vessel.id,
      title: 'Replace the bilge hose',
      category: 'engine',
      priority: 'medium',
      dueDate: '2026-10-08',
      assignee: 'Ines Duarte',
    });

    const created = store.listActivity(1)[0];
    expect(created.kind).toBe('task-created');
    expect(created.taskId).toBe(task.id);

    const part = store.addPart(task.id, { name: 'Bilge hose', quantity: 3 });
    expect(part?.checked).toBe(false);
    expect(store.listActivity(1)[0].kind).toBe('part-added');

    const checked = store.updatePart(task.id, part?.id ?? '', { checked: true });
    expect(checked?.checked).toBe(true);
    expect(store.listActivity(1)[0].kind).toBe('part-checked');

    const completed = store.updateTask(task.id, { status: 'complete' });
    expect(completed?.status).toBe('complete');
    expect(store.listActivity(1)[0].kind).toBe('task-completed');
  });

  it('keeps the activity feed bounded', () => {
    const store = new HarborStore();
    const vessel = store.listVessels()[0];
    const seedSize = store.listActivity().length;

    for (let index = 0; index < 45; index += 1) {
      store.createTask({
        vesselId: vessel.id,
        title: `Bounded feed task ${index}`,
        category: 'hull',
        priority: 'low',
        dueDate: '2026-10-09',
        assignee: 'Dock crew',
      });
    }

    const feed = store.listActivity();
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.length).toBeLessThan(seedSize + 45);
    expect(feed[0].kind).toBe('task-created');
  });
});

describe('HarborStore dashboard', () => {
  it('aggregates fleet, workload, and recent activity', () => {
    const store = new HarborStore();
    const tasks = store.listTasks();
    const open = tasks.filter((task) => task.status !== 'complete');
    const overdue = open.filter((task) => dueDay(task.dueDate) < DEMO_TODAY);
    const dueThisWeek = open.filter((task) => {
      const due = dueDay(task.dueDate);
      return due >= DEMO_TODAY && due <= DEMO_WEEK_END;
    });
    const attention = store.listVessels().filter((vessel) => vessel.status === 'attention');
    const dashboard = store.dashboard();

    expect(dashboard.totalVessels).toBe(store.listVessels().length);
    expect(dashboard.activeTasks).toBe(open.length);
    expect(dashboard.overdue).toBe(overdue.length);
    expect(dashboard.overdue).toBeGreaterThan(0);
    expect(dashboard.dueThisWeek).toBe(dueThisWeek.length);
    expect(dashboard.completedThisMonth).toBeGreaterThanOrEqual(0);
    expect(dashboard.completionRate).toBeGreaterThanOrEqual(0);
    expect(dashboard.completionRate).toBeLessThanOrEqual(100);
    expect(dashboard.attentionVessels.map((vessel) => vessel.id).sort()).toEqual(
      attention.map((vessel) => vessel.id).sort(),
    );
    expect(dashboard.attentionVessels.length).toBeGreaterThan(0);
    expect(dashboard.recentActivity.length).toBeGreaterThan(0);

    const upcomingDueDates = dashboard.upcoming.map((task) => task.dueDate);
    expect(upcomingDueDates.length).toBeGreaterThan(0);
    expect([...upcomingDueDates].sort()).toEqual(upcomingDueDates);
  });

  it('drops an overdue task out of the overdue count when it is completed', () => {
    const store = new HarborStore();
    const before = store.dashboard();
    const overdueTask = store
      .listTasks()
      .find((task) => task.status !== 'complete' && dueDay(task.dueDate) < DEMO_TODAY);

    expect(overdueTask).toBeDefined();
    if (!overdueTask) return;

    const completed = store.updateTask(overdueTask.id, { status: 'complete' });

    expect(completed?.status).toBe('complete');

    const after = store.dashboard();
    expect(after.overdue).toBe(before.overdue - 1);
    expect(after.activeTasks).toBe(before.activeTasks - 1);
    expect(after.completedThisMonth).toBe(before.completedThisMonth + 1);
    expect(after.recentActivity[0].kind).toBe('task-completed');
    expect(after.recentActivity[0].taskId).toBe(overdueTask.id);
  });
});
