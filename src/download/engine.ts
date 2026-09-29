/**
 * Download engine — verified fetches for model assets.
 *
 * Patterns ported from the stock sensevoice worker: HEAD-probe origin
 * ordering, streamed sha256, *.part + atomic rename, error classification.
 * Tarballs are extracted with the system tar (no native bz2 deps).
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export type FailureReason = 'dns' | 'timeout' | 'certificate' | 'storage' | 'network' | 'unknown'

const CODE_PATTERNS: [FailureReason, RegExp][] = [
  ['dns', /^(ENOTFOUND|EAI_AGAIN)$/],
  ['timeout', /^(ETIMEDOUT|ERR_SOCKET_CONNECTION_TIMEOUT|UND_ERR_(CONNECT|HEADERS|BODY)_TIMEOUT)$/],
  ['certificate', /^(CERT_[A-Z_]+|ERR_TLS_CERT_ALTNAME_INVALID|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)$/],
  ['storage', /^(ENOSPC|EDQUOT|EACCES|EPERM|EROFS)$/],
  ['network', /^(ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR_SOCKET)$/],
]

/** Categorize a native fetch/fs failure without leaking raw causes to the UI. */
export function classifyFailure(failure: unknown): { reason: FailureReason; code?: string } {
  const pending: unknown[] = [failure]
  const visited = new Set<unknown>()
  while (pending.length > 0) {
    const error = pending.shift()
    if (!(error instanceof Error) || visited.has(error)) continue
    visited.add(error)
    if (error.name === 'TimeoutError' || error.name === 'TimeoutReason') return { reason: 'timeout' }
    const code = (error as Error & { code?: unknown }).code
    if (typeof code === 'string') {
      for (const [reason, pattern] of CODE_PATTERNS) if (pattern.test(code)) return { reason, code }
    }
    if (error instanceof TypeError && error.message === 'fetch failed') return { reason: 'network' }
    pending.push((error as Error).cause)
    if (error instanceof AggregateError) pending.push(...error.errors)
  }
  return { reason: 'unknown' }
}

export class DownloadError extends Error {
  constructor(
    public readonly resource: string,
    public readonly reason: FailureReason,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(`Unable to download ${resource}: ${reason}${code ? ` (${code})` : ''}${status === undefined ? '' : ` (HTTP ${status})`}`)
  }
}

/** Order candidate origins by first successful HEAD probe (stock-worker pattern). */
export async function orderSources(url: string, origins: readonly string[], timeoutMs: number): Promise<string[]> {
  const path = new URL(url).pathname
  const urls = [...new Set(origins.map((origin) => new URL(path, origin).href))]
  if (urls.length === 1) return urls
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let preferred: string | undefined
  try {
    const results = await Promise.allSettled(urls.map(async (candidate) => {
      const response = await fetch(candidate, { method: 'HEAD', signal: controller.signal })
      return { url: candidate, ok: response.ok }
    }))
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) {
        preferred = result.value.url
        break
      }
    }
  } finally {
    clearTimeout(timer)
  }
  return preferred === undefined ? urls : [preferred, ...urls.filter((u) => u !== preferred)]
}

async function sha256OfFile(path: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

export interface DownloadEvents {
  onProgress?: (completedBytes: number, totalBytes: number) => void
}

/**
 * Fetch one file: streamed sha256 while writing to *.part, size/hash check,
 * atomic rename on success. A full restart replaces resume when the origin
 * ignores Range — fetch streams the whole body either way, and the *.part
 * naming keeps partial writes invisible to the verifier.
 */
export async function downloadFile(
  url: string,
  destination: string,
  expected: { bytes: number | null; sha256: string | null },
  events: DownloadEvents = {},
  signal?: AbortSignal,
): Promise<void> {
  const part = `${destination}.part`
  await mkdir(dirname(destination), { recursive: true })

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    const { reason, code } = classifyFailure(error)
    throw new DownloadError(url, reason, code)
  }
  if (!response.ok || !response.body) throw new DownloadError(url, 'unknown', undefined, response.status)

  const total = Number(response.headers.get('content-length')) || expected.bytes || 0
  let completed = 0
  events.onProgress?.(0, total)
  const digest = createHash('sha256')
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    digest.update(chunk)
    completed += chunk.length
    events.onProgress?.(completed, total)
  })
  try {
    await pipeline(source, createWriteStream(part, { flags: 'w' }))
  } catch (error) {
    const { reason, code } = classifyFailure(error)
    throw new DownloadError(url, reason, code)
  }

  const actualSha = digest.digest('hex')
  const actualBytes = (await stat(part)).size
  if (expected.bytes !== null && expected.bytes > 0 && actualBytes !== expected.bytes) {
    await rm(part, { force: true })
    throw new DownloadError(url, 'unknown', undefined, undefined)
  }
  if (expected.sha256 !== null && actualSha !== expected.sha256) {
    await rm(part, { force: true })
    throw new DownloadError(url, 'unknown')
  }
  if (expected.sha256 === null) {
    // Bootstrap digest for a follow-up catalog-pinning commit.
    console.warn(`[dsh-stt-multi] pin me: ${destination} bytes=${actualBytes} sha256=${actualSha}`)
  }
  await rename(part, destination)
}

/** Verify one extracted/downloaded file against its catalog entry. */
export async function verifyFile(path: string, expected: { bytes: number | null; sha256: string | null }): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return false
    if (expected.bytes !== null && expected.bytes > 0 && info.size !== expected.bytes) return false
    if (expected.sha256 === null) return true
    return (await sha256OfFile(path)) === expected.sha256
  } catch {
    return false
  }
}

/** Extract a .tar.bz2 archive into targetDir using the system tar. */
export async function untar(archive: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xjf', archive, '-C', targetDir], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited ${code}: ${stderr.trim()}`))
    })
  })
}

export { join }
