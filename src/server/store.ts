import type {
  Activity,
  ActivityKind,
  CreatePartInput,
  CreateTaskInput,
  CreateVesselInput,
  Dashboard,
  Part,
  Task,
  TaskQuery,
  UpdatePartInput,
  UpdateTaskInput,
  UpdateVesselInput,
  Vessel,
} from '../shared/types'
import { DEMO_NOW_ISO } from '../shared/types'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const INSPECTION_INTERVAL_MS = 90 * DAY_MS

const MAX_ACTIVITY = 40
const UPCOMING_LIMIT = 5
const RECENT_ACTIVITY_LIMIT = 8

const ACCENTS = ['#0f766e', '#b45309', '#1d4ed8', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f']

const accentFor = (index: number): string => ACCENTS[index % ACCENTS.length] ?? '#0f766e'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const toDay = (value: string): string => value.slice(0, 10)

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const isoStamp = (ms: number): string => new Date(ms).toISOString()

const seedId = (prefix: string, index: number): string =>
  `${prefix}-${String(index).padStart(2, '0')}`

interface Seed {
  vessels: Vessel[]
  tasks: Task[]
  activity: Activity[]
}

const buildSeed = (): Seed => {
  const vessels: Vessel[] = [
    {
      id: 'v-01',
      name: 'Marisol',
      model: '2019 Catalina 34 MKII',
      berth: 'A-12',
      owner: 'Dana Whitfield',
      status: 'ready',
      lastServiced: '2026-09-12',
      nextInspection: '2026-12-05',
      accent: accentFor(0),
    },
    {
      id: 'v-02',
      name: 'Blue Meridian',
      model: '2007 Beneteau Oceanis 40',
      berth: 'B-04',
      owner: 'Rafael Ortiz',
      status: 'attention',
      lastServiced: '2026-08-30',
      nextInspection: '2026-10-02',
      accent: accentFor(1),
    },
    {
      id: 'v-03',
      name: 'Kestrel',
      model: '1998 Grand Banks 42',
      berth: 'C-18',
      owner: 'Priya Raman',
      status: 'hauled',
      lastServiced: '2026-09-20',
      nextInspection: '2026-11-14',
      accent: accentFor(2),
    },
    {
      id: 'v-04',
      name: 'Salt & Cedar',
      model: '2015 Ranger Tugs R-27',
      berth: 'A-02',
      owner: 'Marta Kowalski',
      status: 'ready',
      lastServiced: '2026-09-25',
      nextInspection: '2026-12-19',
      accent: accentFor(3),
    },
    {
      id: 'v-05',
      name: 'Night Heron',
      model: '2021 Axopar 28 Cabin',
      berth: 'D-07',
      owner: 'Theo Brannigan',
      status: 'attention',
      lastServiced: '2026-09-05',
      nextInspection: '2026-10-09',
      accent: accentFor(4),
    },
  ]

  const tasks: Task[] = [
    {
      id: 't-01',
      vesselId: 'v-02',
      title: 'Replace raw-water impeller',
      category: 'engine',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-09-26',
      assignee: 'Owen Hale',
      estimatedHours: 3,
      notes: 'Impeller kit is on order; pump housing shows light scoring.',
      parts: [
        { id: 'p-01', name: 'Impeller kit', quantity: 1, checked: true },
        { id: 'p-02', name: 'Pump gasket', quantity: 2, checked: false },
      ],
      createdAt: '2026-09-21T07:15:00.000Z',
      updatedAt: '2026-09-27T16:20:00.000Z',
    },
    {
      id: 't-02',
      vesselId: 'v-03',
      title: 'Repair keel-strip blisters',
      category: 'hull',
      status: 'complete',
      priority: 'medium',
      dueDate: '2026-09-18',
      assignee: 'Sofia Lindqvist',
      estimatedHours: 12,
      notes: 'Six blisters ground out, dried, and refaired above the waterline.',
      parts: [
        { id: 'p-03', name: 'Barrier coat primer', quantity: 1, checked: true },
        { id: 'p-04', name: 'Fairing compound', quantity: 2, checked: true },
      ],
      createdAt: '2026-09-08T12:00:00.000Z',
      updatedAt: '2026-09-24T15:45:00.000Z',
    },
    {
      id: 't-03',
      vesselId: 'v-02',
      title: 'Replace expired flare kit and restow safety gear',
      category: 'safety',
      status: 'scheduled',
      priority: 'high',
      dueDate: '2026-10-01',
      assignee: 'Owen Hale',
      estimatedHours: 1,
      notes: 'Offshore flare set expired in August; liferaft service due in spring.',
      parts: [{ id: 'p-05', name: 'SOLAS flare kit', quantity: 1, checked: false }],
      createdAt: '2026-09-19T09:30:00.000Z',
      updatedAt: '2026-09-19T09:30:00.000Z',
    },
    {
      id: 't-04',
      vesselId: 'v-01',
      title: 'Annual engine oil and filter service',
      category: 'engine',
      status: 'scheduled',
      priority: 'medium',
      dueDate: '2026-10-04',
      assignee: 'Nadia Cole',
      estimatedHours: 2,
      notes: 'Use 15W-40 diesel oil; log hours in the maintenance binder.',
      parts: [
        { id: 'p-06', name: 'Oil filter', quantity: 1, checked: false },
        { id: 'p-07', name: 'Diesel oil (15W-40)', quantity: 6, checked: false },
      ],
      createdAt: '2026-09-14T08:45:00.000Z',
      updatedAt: '2026-09-14T08:45:00.000Z',
    },
    {
      id: 't-05',
      vesselId: 'v-04',
      title: 'Chartplotter firmware update and NMEA check',
      category: 'electrical',
      status: 'complete',
      priority: 'low',
      dueDate: '2026-09-22',
      assignee: 'Jules Petrov',
      estimatedHours: 2,
      notes: 'Firmware 4.2 installed; depth sounder back on the NMEA 2000 bus.',
      parts: [{ id: 'p-08', name: 'Firmware USB stick', quantity: 1, checked: true }],
      createdAt: '2026-09-10T14:20:00.000Z',
      updatedAt: '2026-09-20T13:10:00.000Z',
    },
    {
      id: 't-06',
      vesselId: 'v-03',
      title: 'Rigging inspection: cap shrouds and turnbuckles',
      category: 'rigging',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-09-29',
      assignee: 'Sofia Lindqvist',
      estimatedHours: 4,
      notes: 'Starboard cap shroud shows slight meat hook at the swage.',
      parts: [{ id: 'p-09', name: 'Turnbuckle cotter pins', quantity: 8, checked: false }],
      createdAt: '2026-09-17T10:05:00.000Z',
      updatedAt: '2026-09-26T11:40:00.000Z',
    },
    {
      id: 't-07',
      vesselId: 'v-05',
      title: 'Bilge pump float switch replacement',
      category: 'electrical',
      status: 'scheduled',
      priority: 'medium',
      dueDate: '2026-10-06',
      assignee: 'Nadia Cole',
      estimatedHours: 2.5,
      notes: 'Rear float switch sticks after heavy rain; test both pumps after swap.',
      parts: [
        { id: 'p-10', name: 'Float switch', quantity: 1, checked: false },
        { id: 'p-11', name: 'Heat-shrink connectors', quantity: 4, checked: false },
      ],
      createdAt: '2026-09-23T15:00:00.000Z',
      updatedAt: '2026-09-23T15:00:00.000Z',
    },
    {
      id: 't-08',
      vesselId: 'v-05',
      title: 'Trailer winch strap and bow eye inspection',
      category: 'hull',
      status: 'scheduled',
      priority: 'low',
      dueDate: '2026-09-27',
      assignee: 'Jules Petrov',
      estimatedHours: 1.5,
      notes: 'Check strap for chafe and torque the bow eye bolts after haul-out.',
      parts: [],
      createdAt: '2026-09-16T13:25:00.000Z',
      updatedAt: '2026-09-16T13:25:00.000Z',
    },
    {
      id: 't-09',
      vesselId: 'v-01',
      title: 'Through-hull and seacock lubrication',
      category: 'hull',
      status: 'scheduled',
      priority: 'medium',
      dueDate: '2026-11-02',
      assignee: 'Owen Hale',
      estimatedHours: 3,
      notes: 'Cycle every seacock and grease the ball valves while the boat is out.',
      parts: [{ id: 'p-12', name: 'Seacock grease', quantity: 1, checked: false }],
      createdAt: '2026-09-25T09:10:00.000Z',
      updatedAt: '2026-09-25T09:10:00.000Z',
    },
    {
      id: 't-10',
      vesselId: 'v-04',
      title: 'Fuel-water separator element change',
      category: 'engine',
      status: 'complete',
      priority: 'high',
      dueDate: '2026-09-12',
      assignee: 'Jules Petrov',
      estimatedHours: 1,
      notes: 'Element replaced after the rough delivery run; fuel sample was clean.',
      parts: [{ id: 'p-13', name: 'Fuel-water separator element', quantity: 1, checked: true }],
      createdAt: '2026-09-05T08:00:00.000Z',
      updatedAt: '2026-09-11T17:30:00.000Z',
    },
  ]

  const activity: Activity[] = [
    {
      id: 'a-08',
      kind: 'task-updated',
      message: 'Impeller housing scored; gasket replacement added to the job',
      timestamp: '2026-09-27T16:20:00.000Z',
      vesselId: 'v-02',
      taskId: 't-01',
    },
    {
      id: 'a-07',
      kind: 'vessel-updated',
      message: 'Blue Meridian flagged for attention after the sea trial',
      timestamp: '2026-09-27T11:05:00.000Z',
      vesselId: 'v-02',
    },
    {
      id: 'a-06',
      kind: 'task-completed',
      message: 'Completed "Repair keel-strip blisters" on Kestrel',
      timestamp: '2026-09-24T15:45:00.000Z',
      vesselId: 'v-03',
      taskId: 't-02',
    },
    {
      id: 'a-05',
      kind: 'part-checked',
      message: 'Checked off "Barrier coat primer" on "Repair keel-strip blisters"',
      timestamp: '2026-09-24T15:40:00.000Z',
      vesselId: 'v-03',
      taskId: 't-02',
    },
    {
      id: 'a-04',
      kind: 'vessel-updated',
      message: 'Kestrel moved to the hardstand for hull work',
      timestamp: '2026-09-22T08:30:00.000Z',
      vesselId: 'v-03',
    },
    {
      id: 'a-03',
      kind: 'task-created',
      message: 'Scheduled "Replace raw-water impeller" for Blue Meridian',
      timestamp: '2026-09-21T07:15:00.000Z',
      vesselId: 'v-02',
      taskId: 't-01',
    },
    {
      id: 'a-02',
      kind: 'task-completed',
      message: 'Completed "Chartplotter firmware update and NMEA check" on Salt & Cedar',
      timestamp: '2026-09-20T13:10:00.000Z',
      vesselId: 'v-04',
      taskId: 't-05',
    },
    {
      id: 'a-01',
      kind: 'vessel-created',
      message: 'Added Night Heron to berth D-07',
      timestamp: '2026-09-18T09:00:00.000Z',
      vesselId: 'v-05',
    },
  ]

  return { vessels, tasks, activity }
}

export class HarborStore {
  private vessels: Vessel[]
  private tasks: Task[]
  private activity: Activity[]
  private vesselCounter: number
  private taskCounter: number
  private partCounter: number
  private activityCounter: number
  private clock: number

  constructor() {
    const seed = buildSeed()
    this.vessels = seed.vessels
    this.tasks = seed.tasks
    this.activity = seed.activity
    this.vesselCounter = seed.vessels.length
    this.taskCounter = seed.tasks.length
    this.partCounter = seed.tasks.reduce((total, task) => total + task.parts.length, 0)
    this.activityCounter = seed.activity.length
    this.clock = Date.parse(DEMO_NOW_ISO)
  }

  listVessels(): Vessel[] {
    return this.vessels.map(clone)
  }

  getVessel(vesselId: string): Vessel | undefined {
    const vessel = this.vessels.find((candidate) => candidate.id === vesselId)
    return vessel ? clone(vessel) : undefined
  }

  createVessel(input: CreateVesselInput): Vessel {
    this.vesselCounter += 1
    this.clock += MINUTE_MS
    const vessel: Vessel = {
      id: seedId('v', this.vesselCounter),
      name: input.name.trim(),
      model: input.model.trim(),
      berth: input.berth.trim(),
      owner: input.owner.trim(),
      status: 'ready',
      lastServiced: isoDay(this.clock),
      nextInspection: input.nextInspection?.trim() || isoDay(this.clock + INSPECTION_INTERVAL_MS),
      accent: accentFor(this.vesselCounter - 1),
    }
    this.vessels.push(vessel)
    this.record('vessel-created', `Added ${vessel.name} to berth ${vessel.berth}`, {
      vesselId: vessel.id,
    })
    return clone(vessel)
  }

  updateVessel(vesselId: string, patch: UpdateVesselInput): Vessel | undefined {
    const vessel = this.vessels.find((candidate) => candidate.id === vesselId)
    if (!vessel) return undefined

    const changes: string[] = []
    if (patch.status !== undefined && patch.status !== vessel.status) {
      changes.push(`status ${vessel.status} -> ${patch.status}`)
      vessel.status = patch.status
    }
    if (patch.berth !== undefined && patch.berth.trim() !== vessel.berth) {
      changes.push(`berth ${vessel.berth} -> ${patch.berth.trim()}`)
      vessel.berth = patch.berth.trim()
    }
    if (
      patch.nextInspection !== undefined &&
      patch.nextInspection.trim() !== vessel.nextInspection
    ) {
      changes.push(`next inspection ${vessel.nextInspection} -> ${patch.nextInspection.trim()}`)
      vessel.nextInspection = patch.nextInspection.trim()
    }

    if (changes.length === 0) return clone(vessel)

    this.clock += MINUTE_MS
    this.record('vessel-updated', `Updated ${vessel.name}: ${changes.join(', ')}`, {
      vesselId: vessel.id,
    })
    return clone(vessel)
  }

  listTasks(query: TaskQuery = {}): Task[] {
    const status = query.status ?? 'all'
    const vesselId = query.vesselId?.trim()
    const term = query.q?.trim().toLowerCase()

    return this.tasks
      .filter((task) => {
        if (status !== 'all' && task.status !== status) return false
        if (vesselId && task.vesselId !== vesselId) return false
        if (term && !matchesText(task, term)) return false
        return true
      })
      .sort((left, right) => compareTasks(left, right))
      .map(clone)
  }

  getTask(taskId: string): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === taskId)
    return task ? clone(task) : undefined
  }

  createTask(input: CreateTaskInput): Task {
    const vessel = this.vessels.find((candidate) => candidate.id === input.vesselId)
    if (!vessel) throw new Error(`Unknown vessel: ${input.vesselId}`)

    this.taskCounter += 1
    this.clock += MINUTE_MS
    const stamp = isoStamp(this.clock)
    const task: Task = {
      id: seedId('t', this.taskCounter),
      vesselId: vessel.id,
      title: input.title.trim(),
      category: input.category,
      status: 'scheduled',
      priority: input.priority,
      dueDate: input.dueDate.trim(),
      assignee: input.assignee.trim(),
      estimatedHours: input.estimatedHours ?? 0,
      notes: input.notes?.trim() ?? '',
      parts: [],
      createdAt: stamp,
      updatedAt: stamp,
    }
    this.tasks.push(task)
    this.record('task-created', `Scheduled "${task.title}" for ${vessel.name}`, {
      vesselId: vessel.id,
      taskId: task.id,
    })
    return clone(task)
  }

  updateTask(taskId: string, patch: UpdateTaskInput): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return undefined

    const changes: string[] = []
    const previousStatus = task.status

    if (patch.title !== undefined && patch.title.trim() !== task.title) {
      changes.push(`title -> "${patch.title.trim()}"`)
      task.title = patch.title.trim()
    }
    if (patch.priority !== undefined && patch.priority !== task.priority) {
      changes.push(`priority ${task.priority} -> ${patch.priority}`)
      task.priority = patch.priority
    }
    if (patch.dueDate !== undefined && patch.dueDate.trim() !== task.dueDate) {
      changes.push(`due ${task.dueDate} -> ${patch.dueDate.trim()}`)
      task.dueDate = patch.dueDate.trim()
    }
    if (patch.assignee !== undefined && patch.assignee.trim() !== task.assignee) {
      changes.push(`assignee ${task.assignee} -> ${patch.assignee.trim()}`)
      task.assignee = patch.assignee.trim()
    }
    if (patch.notes !== undefined && patch.notes.trim() !== task.notes) {
      changes.push('notes updated')
      task.notes = patch.notes.trim()
    }
    if (patch.status !== undefined && patch.status !== task.status) {
      changes.push(`status ${task.status} -> ${patch.status}`)
      task.status = patch.status
    }

    if (changes.length === 0) return clone(task)

    this.clock += MINUTE_MS
    task.updatedAt = isoStamp(this.clock)

    const vesselName = this.vesselNameOf(task.vesselId)
    if (task.status === 'complete' && previousStatus !== 'complete') {
      this.record('task-completed', `Completed "${task.title}" on ${vesselName}`, {
        vesselId: task.vesselId,
        taskId: task.id,
      })
    } else {
      this.record('task-updated', `Updated "${task.title}" (${changes.join(', ')})`, {
        vesselId: task.vesselId,
        taskId: task.id,
      })
    }
    return clone(task)
  }

  deleteTask(taskId: string): boolean {
    const index = this.tasks.findIndex((candidate) => candidate.id === taskId)
    if (index === -1) return false

    const removed = this.tasks[index]
    if (!removed) return false

    this.tasks.splice(index, 1)
    this.clock += MINUTE_MS
    this.record(
      'task-deleted',
      `Deleted "${removed.title}" from ${this.vesselNameOf(removed.vesselId)}`,
      {
        vesselId: removed.vesselId,
        taskId: removed.id,
      },
    )
    return true
  }

  addPart(taskId: string, input: CreatePartInput): Part | undefined {
    const task = this.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return undefined

    this.partCounter += 1
    this.clock += MINUTE_MS
    const part: Part = {
      id: seedId('p', this.partCounter),
      name: input.name.trim(),
      quantity: input.quantity ?? 1,
      checked: false,
    }
    task.parts.push(part)
    task.updatedAt = isoStamp(this.clock)
    this.record('part-added', `Added part "${part.name}" to "${task.title}"`, {
      vesselId: task.vesselId,
      taskId: task.id,
    })
    return clone(part)
  }

  updatePart(taskId: string, partId: string, patch: UpdatePartInput): Part | undefined {
    const task = this.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return undefined

    const part = task.parts.find((candidate) => candidate.id === partId)
    if (!part) return undefined
    if (part.checked === patch.checked) return clone(part)

    this.clock += MINUTE_MS
    part.checked = patch.checked
    task.updatedAt = isoStamp(this.clock)
    this.record(
      patch.checked ? 'part-checked' : 'part-unchecked',
      `${patch.checked ? 'Checked off' : 'Reopened'} "${part.name}" on "${task.title}"`,
      { vesselId: task.vesselId, taskId: task.id },
    )
    return clone(part)
  }

  dashboard(): Dashboard {
    const today = isoDay(this.clock)
    const weekEnd = isoDay(this.clock + WEEK_MS)
    const month = today.slice(0, 7)

    const openTasks = this.tasks.filter((task) => task.status !== 'complete')
    const completed = this.tasks.filter((task) => task.status === 'complete')
    const overdue = openTasks.filter((task) => toDay(task.dueDate) < today)
    const dueThisWeek = openTasks.filter((task) => {
      const due = toDay(task.dueDate)
      return due >= today && due <= weekEnd
    })
    const completedThisMonth = completed.filter((task) => task.updatedAt.slice(0, 7) === month)
    const completionRate = this.tasks.length
      ? Math.round((completed.length / this.tasks.length) * 100)
      : 0

    const upcoming = [...openTasks]
      .sort((left, right) => compareTasks(left, right))
      .slice(0, UPCOMING_LIMIT)
      .map(clone)

    return {
      totalVessels: this.vessels.length,
      activeTasks: openTasks.length,
      dueThisWeek: dueThisWeek.length,
      overdue: overdue.length,
      completedThisMonth: completedThisMonth.length,
      completionRate,
      attentionVessels: this.vessels.filter((vessel) => vessel.status === 'attention').map(clone),
      upcoming,
      recentActivity: this.listActivity(RECENT_ACTIVITY_LIMIT),
    }
  }

  listActivity(limit = MAX_ACTIVITY): Activity[] {
    return this.activity.slice(0, Math.max(0, limit)).map(clone)
  }

  private vesselNameOf(vesselId: string): string {
    return this.vessels.find((vessel) => vessel.id === vesselId)?.name ?? 'the dock'
  }

  private record(
    kind: ActivityKind,
    message: string,
    refs: { vesselId?: string; taskId?: string },
  ): void {
    this.activityCounter += 1
    const entry: Activity = {
      id: seedId('a', this.activityCounter),
      kind,
      message,
      timestamp: isoStamp(this.clock),
    }
    if (refs.vesselId) entry.vesselId = refs.vesselId
    if (refs.taskId) entry.taskId = refs.taskId

    this.activity.unshift(entry)
    if (this.activity.length > MAX_ACTIVITY) this.activity.length = MAX_ACTIVITY
  }
}

const matchesText = (task: Task, term: string): boolean =>
  [task.title, task.notes, task.assignee, task.category].some((field) =>
    field.toLowerCase().includes(term),
  )

const compareTasks = (left: Task, right: Task): number =>
  left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id)
