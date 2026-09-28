export type VesselStatus = 'ready' | 'attention' | 'hauled'

export type TaskStatus = 'scheduled' | 'in-progress' | 'complete'

export type TaskPriority = 'low' | 'medium' | 'high'

export type TaskCategory = 'engine' | 'hull' | 'safety' | 'electrical' | 'rigging'

export type ActivityKind =
  | 'vessel-created'
  | 'vessel-updated'
  | 'task-created'
  | 'task-updated'
  | 'task-completed'
  | 'task-deleted'
  | 'part-added'
  | 'part-checked'
  | 'part-unchecked'

export const VESSEL_STATUSES: readonly VesselStatus[] = ['ready', 'attention', 'hauled']

export const TASK_STATUSES: readonly TaskStatus[] = ['scheduled', 'in-progress', 'complete']

export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high']

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  'engine',
  'hull',
  'safety',
  'electrical',
  'rigging',
]

/** Fixed demo clock the deterministic seed and dashboard aggregation are anchored to. */
export const DEMO_NOW_ISO = '2026-09-28T09:00:00.000Z'

export const DEMO_TODAY = '2026-09-28'

export interface Part {
  id: string
  name: string
  quantity: number
  checked: boolean
}

export interface Vessel {
  id: string
  name: string
  model: string
  berth: string
  owner: string
  status: VesselStatus
  lastServiced: string
  nextInspection: string
  accent: string
}

export interface Task {
  id: string
  vesselId: string
  title: string
  category: TaskCategory
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  assignee: string
  estimatedHours: number
  notes: string
  parts: Part[]
  createdAt: string
  updatedAt: string
}

export interface Activity {
  id: string
  kind: ActivityKind
  message: string
  timestamp: string
  vesselId?: string
  taskId?: string
}

export interface Dashboard {
  totalVessels: number
  activeTasks: number
  dueThisWeek: number
  overdue: number
  completedThisMonth: number
  completionRate: number
  attentionVessels: Vessel[]
  upcoming: Task[]
  recentActivity: Activity[]
}

export interface HealthResponse {
  status: 'ok'
  service: 'harborlog'
}

export interface CreateVesselInput {
  name: string
  model: string
  berth: string
  owner: string
  nextInspection?: string
}

export interface UpdateVesselInput {
  status?: VesselStatus
  nextInspection?: string
  berth?: string
}

export interface CreateTaskInput {
  vesselId: string
  title: string
  category: TaskCategory
  priority: TaskPriority
  dueDate: string
  assignee: string
  estimatedHours?: number
  notes?: string
}

export interface UpdateTaskInput {
  status?: TaskStatus
  title?: string
  priority?: TaskPriority
  dueDate?: string
  assignee?: string
  notes?: string
}

export interface CreatePartInput {
  name: string
  quantity?: number
}

export interface UpdatePartInput {
  checked: boolean
}

export interface TaskQuery {
  status?: TaskStatus | 'all'
  vesselId?: string
  q?: string
}

export interface ApiError {
  error: string
}
