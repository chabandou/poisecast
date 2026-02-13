import { createStreamProxyCoreFromEnv, type StreamProxyHttpRequest } from './shared/streamProxyCore'
import { createNodeStreamPipeResponder, handleStreamProxyRequest, type NodeLikeWritable } from './shared/streamProxyHandler'

const core = createStreamProxyCoreFromEnv(process.env)

export const config = {
  runtime: 'nodejs',
}

type ResponseLike = {
  status: (code: number) => { json: (body: unknown) => void; end: (body?: string) => void }
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
  writableEnded?: boolean
}

function json(res: ResponseLike, statusCode: number, body: unknown): void {
  res.status(statusCode).json(body)
}

export default async function handler(req: StreamProxyHttpRequest, res: ResponseLike) {
  await handleStreamProxyRequest(core, req, {
    setHeader: (name, value) => res.setHeader(name, value),
    setStatusCode: (statusCode) => {
      res.status(statusCode)
    },
    sendJson: (statusCode, body) => json(res, statusCode, body),
    end: () => res.end(),
    pipeFromWeb: createNodeStreamPipeResponder(res as unknown as NodeLikeWritable),
  })
}
