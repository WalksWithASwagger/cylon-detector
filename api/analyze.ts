import { analysisRequestV2Schema, toLegacyAnalysisRequest } from '../src/bench/v2/contracts'
import { defaultBenchmarkRegistry } from '../src/bench/v2/defaultRegistry'
import { resolveBenchmark } from '../src/bench/v2/registry'
import { analyzePaper } from '../src/server/analyzePaper'
import {
  InviteAccessError,
  type InviteGrant,
  type InvitePolicy
} from '../src/server/invitePolicy'
import { createInvitePolicyFromEnvironment } from '../src/server/invitePolicyFactory'
import type { ApiRequest, ApiResponse } from './http'

const MAX_JSON_CHARACTERS = 2 * 1024 * 1024

function bearerCode(provided: string | undefined): string {
  return provided?.startsWith('Bearer ') ? provided.slice(7) : ''
}

function requestIp(req: ApiRequest): string {
  const forwarded = req.headers?.['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return value?.split(',')[0]?.trim() || 'unknown'
}

interface AnalyzeHandlerDependencies {
  invitePolicy: InvitePolicy
  analyze: typeof analyzePaper
  liveAnalysisEnabled?: boolean
}

export function createAnalyzeHandler(dependencies: AnalyzeHandlerDependencies) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    if (dependencies.liveAnalysisEnabled === false) {
      return res.status(503).json({
        error: 'Live analysis is globally disabled. Local rehearsal remains available.',
        code: 'ANALYSIS_DISABLED'
      })
    }

    if (JSON.stringify(req.body).length > MAX_JSON_CHARACTERS) {
      return res.status(413).json({ error: 'Analysis request exceeds the 2 MB alpha limit' })
    }

    const parsed = analysisRequestV2Schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid analysis request',
        fields: parsed.error.flatten().fieldErrors
      })
    }

    try {
      await resolveBenchmark(defaultBenchmarkRegistry, parsed.data.benchmark)
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Benchmark resolution failed',
        code: 'BENCHMARK_MISMATCH'
      })
    }

    let grant: InviteGrant
    try {
      const authorization = req.headers?.authorization
      grant = await dependencies.invitePolicy.authorize({
        code: bearerCode(typeof authorization === 'string' ? authorization : undefined),
        ipAddress: requestIp(req),
        inputCharacters: parsed.data.paper.characterCount
      })
    } catch (error) {
      if (error instanceof InviteAccessError) {
        return res.status(error.status).json({ error: error.message, code: error.code })
      }
      return res.status(503).json({
        error: 'Invite access is unavailable',
        code: 'INVITE_UNAVAILABLE'
      })
    }

    try {
      const result = await dependencies.analyze(toLegacyAnalysisRequest(parsed.data))
      await dependencies.invitePolicy.recordUsage(grant, {
        status: 'success',
        inputTokens: result.analysis.inputTokens,
        outputTokens: result.analysis.outputTokens,
        latencyMs: result.analysis.latencyMs
      })
      return res.status(200).json(result)
    } catch (error) {
      await dependencies.invitePolicy.recordUsage(grant, {
        status: 'failure',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0
      }).catch(() => undefined)
      console.error('Theory analysis failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
        inviteId: grant.inviteId
      })
      return res.status(503).json({
        error: 'Theory analysis is unavailable. The local paper remains available for retry.',
        code: 'ANALYSIS_UNAVAILABLE'
      })
    }
  }
}

export default createAnalyzeHandler({
  invitePolicy: createInvitePolicyFromEnvironment(),
  analyze: analyzePaper,
  liveAnalysisEnabled: process.env.MAC_LIVE_ANALYSIS_ENABLED === 'true'
})
