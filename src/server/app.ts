import { Elysia } from 'elysia'
import { HarborStore } from './store'
import type {
  CreatePartInput,
  CreateTaskInput,
  CreateVesselInput,
  TaskCategory,
  TaskPriority,
  TaskQuery,
  TaskStatus,
  UpdateTaskInput,
  UpdateVesselInput,
  VesselStatus,
} from '../shared/types'
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, VESSEL_STATUSES } from '../shared/types'

type JsonBody = Record<string, unknown>

export interface StatusSink {
  status?: number | string
}

export interface ErrorContext {
  code: string | number
  error: unknown
  set: StatusSink
}

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

const asBody = (value: unknown): JsonBody =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonBody) : {}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const isIsoDate = (value: unknown): value is string =>
  isText(value) && ISO_DATE.test(value.trim()) && !Number.isNaN(Date.parse(value.trim()))

const isQuantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isHours = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value)

const fail = (set: StatusSink, status: number, error: string) => {
  set.status = status
  return { error }
}

const missingFields = (body: JsonBody, fields: readonly string[]): string[] =>
  fields.filter((field) => !isText(body[field]))

export const jsonErrorHandler = ({ code, error, set }: ErrorContext) => {
  if (code === 'NOT_FOUND') return fail(set, 404, 'Not found')
  if (code === 'PARSE') return fail(set, 400, 'Malformed JSON body')
  if (code === 'VALIDATION') return fail(set, 400, 'Invalid request')
  if (code === 'UNKNOWN' || code === 'INTERNAL_SERVER_ERROR') {
    return fail(set, 500, error instanceof Error ? error.message : 'Internal server error')
  }
  return undefined
}

export function createApp(store: HarborStore = new HarborStore()) {
  return new Elysia({ name: 'harborlog' })
    .onError(jsonErrorHandler)
    .get('/api/health', () => ({ status: 'ok' as const, service: 'harborlog' as const }))
    .get('/api/dashboard', () => store.dashboard())
    .get('/api/vessels', () => store.listVessels())
    .get('/api/vessels/:id', ({ params, set }) => {
      const vessel = store.getVessel(params.id)
      return vessel ?? fail(set, 404, `No vessel with id ${params.id}`)
    })
    .post('/api/vessels', ({ body, set }) => {
      const input = asBody(body)
      const missing = missingFields(input, ['name', 'model', 'berth', 'owner'])
      if (missing.length > 0) {
        return fail(set, 400, `Missing required field(s): ${missing.join(', ')}`)
      }
      if (input.nextInspection !== undefined && !isIsoDate(input.nextInspection)) {
        return fail(set, 400, 'nextInspection must be an ISO date')
      }

      const payload: CreateVesselInput = {
        name: text(input.name),
        model: text(input.model),
        berth: text(input.berth),
        owner: text(input.owner),
      }
      if (input.nextInspection !== undefined) payload.nextInspection = text(input.nextInspection)

      set.status = 201
      return store.createVessel(payload)
    })
    .patch('/api/vessels/:id', ({ params, body, set }) => {
      const input = asBody(body)
      const patch: UpdateVesselInput = {}

      if (input.status !== undefined) {
        if (!isOneOf(VESSEL_STATUSES, input.status)) {
          return fail(set, 400, `status must be one of: ${VESSEL_STATUSES.join(', ')}`)
        }
        patch.status = input.status as VesselStatus
      }
      if (input.berth !== undefined) {
        if (!isText(input.berth)) return fail(set, 400, 'berth must be a non-empty string')
        patch.berth = text(input.berth)
      }
      if (input.nextInspection !== undefined) {
        if (!isIsoDate(input.nextInspection)) {
          return fail(set, 400, 'nextInspection must be an ISO date')
        }
        patch.nextInspection = text(input.nextInspection)
      }

      const vessel = store.updateVessel(params.id, patch)
      return vessel ?? fail(set, 404, `No vessel with id ${params.id}`)
    })
    .get('/api/tasks', ({ query, set }) => {
      const status = query.status ?? 'all'
      if (status !== 'all' && !isOneOf(TASK_STATUSES, status)) {
        return fail(set, 400, `status must be one of: all, ${TASK_STATUSES.join(', ')}`)
      }

      const filters: TaskQuery = { status: status as TaskStatus | 'all' }
      const vesselId = query.vesselId?.trim()
      const term = query.q?.trim()
      if (vesselId) filters.vesselId = vesselId
      if (term) filters.q = term

      return store.listTasks(filters)
    })
    .get('/api/tasks/:id', ({ params, set }) => {
      const task = store.getTask(params.id)
      return task ?? fail(set, 404, `No task with id ${params.id}`)
    })
    .post('/api/tasks', ({ body, set }) => {
      const input = asBody(body)
      const missing = missingFields(input, ['vesselId', 'title', 'dueDate', 'assignee'])
      if (missing.length > 0) {
        return fail(set, 400, `Missing required field(s): ${missing.join(', ')}`)
      }
      if (!isOneOf(TASK_CATEGORIES, input.category)) {
        return fail(set, 400, `category must be one of: ${TASK_CATEGORIES.join(', ')}`)
      }
      if (!isOneOf(TASK_PRIORITIES, input.priority)) {
        return fail(set, 400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`)
      }
      if (!isIsoDate(input.dueDate)) {
        return fail(set, 400, 'dueDate must be an ISO date')
      }
      if (input.estimatedHours !== undefined && !isHours(input.estimatedHours)) {
        return fail(set, 400, 'estimatedHours must be a number greater than or equal to 0')
      }
      if (input.notes !== undefined && typeof input.notes !== 'string') {
        return fail(set, 400, 'notes must be a string')
      }
      if (!store.getVessel(text(input.vesselId))) {
        return fail(set, 400, `No vessel with id ${text(input.vesselId)}`)
      }

      const payload: CreateTaskInput = {
        vesselId: text(input.vesselId),
        title: text(input.title),
        category: input.category as TaskCategory,
        priority: input.priority as TaskPriority,
        dueDate: text(input.dueDate),
        assignee: text(input.assignee),
      }
      if (input.estimatedHours !== undefined) {
        payload.estimatedHours = input.estimatedHours as number
      }
      if (input.notes !== undefined) payload.notes = text(input.notes)

      set.status = 201
      return store.createTask(payload)
    })
    .patch('/api/tasks/:id', ({ params, body, set }) => {
      const input = asBody(body)
      const patch: UpdateTaskInput = {}

      if (input.status !== undefined) {
        if (!isOneOf(TASK_STATUSES, input.status)) {
          return fail(set, 400, `status must be one of: ${TASK_STATUSES.join(', ')}`)
        }
        patch.status = input.status as TaskStatus
      }
      if (input.priority !== undefined) {
        if (!isOneOf(TASK_PRIORITIES, input.priority)) {
          return fail(set, 400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`)
        }
        patch.priority = input.priority as TaskPriority
      }
      if (input.title !== undefined) {
        if (!isText(input.title)) return fail(set, 400, 'title must be a non-empty string')
        patch.title = text(input.title)
      }
      if (input.dueDate !== undefined) {
        if (!isIsoDate(input.dueDate)) return fail(set, 400, 'dueDate must be an ISO date')
        patch.dueDate = text(input.dueDate)
      }
      if (input.assignee !== undefined) {
        if (!isText(input.assignee)) return fail(set, 400, 'assignee must be a non-empty string')
        patch.assignee = text(input.assignee)
      }
      if (input.notes !== undefined) {
        if (typeof input.notes !== 'string') return fail(set, 400, 'notes must be a string')
        patch.notes = text(input.notes)
      }

      const task = store.updateTask(params.id, patch)
      return task ?? fail(set, 404, `No task with id ${params.id}`)
    })
    .delete('/api/tasks/:id', ({ params, set }) => {
      const deleted = store.deleteTask(params.id)
      if (!deleted) return fail(set, 404, `No task with id ${params.id}`)
      return { ok: true as const }
    })
    .post('/api/tasks/:id/parts', ({ params, body, set }) => {
      const input = asBody(body)
      if (!isText(input.name)) return fail(set, 400, 'name is required')
      if (input.quantity !== undefined && !isQuantity(input.quantity)) {
        return fail(set, 400, 'quantity must be a number greater than 0')
      }

      const payload: CreatePartInput = { name: text(input.name) }
      if (input.quantity !== undefined) payload.quantity = input.quantity as number

      const part = store.addPart(params.id, payload)
      if (!part) return fail(set, 404, `No task with id ${params.id}`)

      set.status = 201
      return part
    })
    .patch('/api/tasks/:id/parts/:partId', ({ params, body, set }) => {
      const input = asBody(body)
      if (typeof input.checked !== 'boolean') return fail(set, 400, 'checked must be a boolean')

      const part = store.updatePart(params.id, params.partId, { checked: input.checked })
      if (!part) return fail(set, 404, `No part ${params.partId} on task ${params.id}`)
      return part
    })
    .get('/api/activity', () => store.listActivity())
}
