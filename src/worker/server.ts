/**
 * Authenticated loopback transport for one serial native recognizer.
 * Ported verbatim in spirit from the stock sensevoice worker: timing-safe
 * Bearer compare, /transcribe only, readiness never touches stdout again.
 */

import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { SpeechInputError } from './inference.js'

export interface RecognitionServer {
  server: import('node:http').Server
  port: number
}

export async function startRecognitionServer(
  token: string,
  maxAudioBytes: number,
  transcribe: (audio: Buffer, language: string) => { text: string; audioSeconds: number; inferenceSeconds: number },
): Promise<RecognitionServer> {
  const expected = Buffer.from(`Bearer ${token}`)
  const server = createServer((request, response) => {
    const reply = (status: number, value: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    }
    const authorization = Buffer.from(request.headers.authorization ?? '')
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      request.resume()
      reply(401, { error: 'Unauthorized' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method !== 'POST' || url.pathname !== '/transcribe') {
      request.resume()
      reply(404, { error: 'Unknown endpoint' })
      return
    }
    const length = Number(request.headers['content-length'])
    if (!Number.isSafeInteger(length) || length < 46 || length > maxAudioBytes) {
      request.resume()
      reply(413, { error: 'Invalid speech audio size', code: 'invalid-input' })
      return
    }
    void (async () => {
      try {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(chunk as Buffer)
        reply(200, transcribe(Buffer.concat(chunks), url.searchParams.get('language') ?? 'auto'))
      } catch (error) {
        reply(error instanceof SpeechInputError ? 400 : 500, {
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof SpeechInputError ? { code: 'invalid-input' } : {}),
        })
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return { server, port: (server.address() as { port: number }).port }
}
