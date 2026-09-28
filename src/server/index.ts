import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { node } from '@elysiajs/node'
import { staticPlugin } from '@elysiajs/static'
import { Elysia } from 'elysia'
import { createApp, jsonErrorHandler } from './app'

const port = Number.parseInt(process.env.PORT ?? '', 10) || 4173
const hostname = '0.0.0.0'
const clientDir = resolve(process.cwd(), 'dist')
const hasClientBuild = existsSync(join(clientDir, 'index.html'))

async function createServer() {
  const base = new Elysia({ adapter: node() }).onError(jsonErrorHandler).use(createApp())
  if (!hasClientBuild) return base

  const statics = await staticPlugin({
    assets: clientDir,
    prefix: '/',
    indexHTML: true,
    alwaysStatic: true,
    staticLimit: 4096,
  })

  return base.use(statics) as unknown as typeof base
}

async function start() {
  const app = await createServer()
  await app.listen({ port, hostname }, () => {
    console.log(
      `Harborlog listening on http://${hostname}:${port}${hasClientBuild ? ' (serving dist)' : ''}`,
    )
  })
}

void start().catch((error: unknown) => {
  console.error('Harborlog failed to start:', error)
  process.exitCode = 1
})
