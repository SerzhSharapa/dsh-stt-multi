import { describe, expect, it, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadFile } from '../src/download/engine.js'

let server: import('node:http').Server | null = null
let dir: string | null = null

afterEach(async () => {
  server?.close()
  if (dir) await rm(dir, { recursive: true, force: true })
})

function rangeServer(payload: Buffer): { port: Promise<number>; requests: string[] } {
  const requests: string[] = []
  const port = new Promise<number>((resolve) => {
    server = createServer((request, response) => {
      const range = request.headers.range ?? null
      requests.push(range ?? '<none>')
      if (range) {
        const start = Number(range.replace(/bytes=(\d+)-/, '$1'))
        response.writeHead(206, {
          'content-length': String(payload.length - start),
          'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
        })
        response.end(payload.subarray(start))
        return
      }
      response.writeHead(200, { 'content-length': String(payload.length) })
      response.end(payload)
    })
    server.listen(0, '127.0.0.1', () => resolve((server!.address() as { port: number }).port))
  })
  return { port, requests }
}

describe('downloadFile Range resume', () => {
  it('resumes from a pre-existing *.part + offset marker and produces the intact file', { timeout: 60000 }, async () => {
    const payload = randomBytes(300_000)
    const sha = createHash('sha256').update(payload).digest('hex')
    const { port, requests } = rangeServer(payload)
    dir = await mkdtemp(join(tmpdir(), 'dsh-stt-resume-'))
    const dest = join(dir, 'model.bin')

    writeFileSync(`${dest}.part`, payload.subarray(0, 100_000))
    writeFileSync(`${dest}.sha256offset`, '100000')

    await downloadFile(`http://127.0.0.1:${await port}/m.bin`, dest, { bytes: payload.length, sha256: sha }, {})

    expect(requests).toEqual(['bytes=100000-'])
    expect(statSync(dest).size).toBe(payload.length)
    expect(Buffer.compare(readFileSync(dest), payload)).toBe(0)
    expect(existsSync(`${dest}.part`)).toBe(false)
    expect(existsSync(`${dest}.sha256offset`)).toBe(false)
  })

  it('restarts from scratch when the origin ignores Range', { timeout: 60000 }, async () => {
    const payload = randomBytes(200_000)
    const sha = createHash('sha256').update(payload).digest('hex')
    const port = new Promise<number>((resolve) => {
      server = createServer((_request, response) => {
        response.writeHead(200, { 'content-length': String(payload.length) })
        response.end(payload)
      })
      server.listen(0, '127.0.0.1', () => resolve((server!.address() as { port: number }).port))
    })
    dir = await mkdtemp(join(tmpdir(), 'dsh-stt-resume2-'))
    const dest = join(dir, 'model.bin')
    writeFileSync(`${dest}.part`, payload.subarray(0, 50_000))
    writeFileSync(`${dest}.sha256offset`, '50000')

    await downloadFile(`http://127.0.0.1:${await port}/m.bin`, dest, { bytes: payload.length, sha256: sha }, {})
    expect(statSync(dest).size).toBe(payload.length)
    expect(Buffer.compare(readFileSync(dest), payload)).toBe(0)
  })
})
