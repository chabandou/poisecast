import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { methodAllowed, type StreamProxyCore, type StreamProxyHttpRequest } from './streamProxyCore'

export type StreamProxyResponder = {
  setHeader: (name: string, value: string) => void
  setStatusCode: (statusCode: number) => void
  sendJson: (statusCode: number, body: unknown) => void
  end: () => void
  pipeFromWeb: (body: ReadableStream<Uint8Array>) => Promise<void>
}

export type NodeLikeWritable = NodeJS.WritableStream & {
  end: (chunk?: string | Uint8Array) => void
  writableEnded?: boolean
}

export function createNodeStreamPipeResponder(
  writable: NodeLikeWritable,
): (body: ReadableStream<Uint8Array>) => Promise<void> {
  return async (body) => {
    const source = Readable.fromWeb(body as unknown as ReadableStream<Uint8Array>)
    try {
      await pipeline(source, writable)
    } catch {
      if (!writable.writableEnded) writable.end()
    }
  }
}

export async function handleStreamProxyRequest(
  core: StreamProxyCore,
  req: StreamProxyHttpRequest,
  responder: StreamProxyResponder,
): Promise<void> {
  const method = req.method ?? 'GET'
  if (!methodAllowed(method)) {
    responder.sendJson(405, { error: 'Method not allowed' })
    return
  }

  const rawTarget = core.readTargetQuery(req)
  if (!rawTarget) {
    responder.sendJson(400, { error: 'Missing "url" query parameter' })
    return
  }

  const target = core.parseTarget(rawTarget)
  if (!target) {
    responder.sendJson(400, { error: 'Invalid or blocked URL' })
    return
  }

  const clientIp = core.getClientIp(req.headers)
  const rateGate = core.tryAcquireRateSlot(clientIp)
  if (!rateGate.ok) {
    responder.setHeader('retry-after', String(rateGate.retryAfterSeconds))
    responder.sendJson(429, { error: 'Rate limit exceeded' })
    return
  }

  try {
    const upstream = await core.fetchWithSafeRedirects(target, {
      method,
      headers: core.buildUpstreamHeaders(req.headers),
      cache: 'no-store',
    })

    core.copyStreamHeaders(upstream, { setHeader: responder.setHeader })
    responder.setHeader('cache-control', 'private, no-store')
    responder.setStatusCode(upstream.status)

    if (method === 'HEAD' || !upstream.body) {
      responder.end()
      return
    }

    await responder.pipeFromWeb(upstream.body as unknown as ReadableStream<Uint8Array>)
  } catch (error) {
    responder.sendJson(502, {
      error: 'Upstream fetch failed',
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    core.releaseRateSlot(clientIp)
  }
}
