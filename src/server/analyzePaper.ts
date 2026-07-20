import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { analysisResponseSchema, type AnalysisResponse } from '@/bench/analysis'
import { createMockAnalysis } from '@/bench/mockAnalysis'
import { sha256Text } from '@/bench/hash'
import {
  aiDraftSchema,
  type AnalysisRequest
} from '@/bench/schema'
import { buildPaperPrompt, buildSystemPrompt, PROMPT_VERSION } from './prompt'

async function createLiveAnalysis(request: AnalysisRequest, startedAt: number): Promise<AnalysisResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Live analysis requires OPENAI_API_KEY')

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-sol'
  const systemPrompt = buildSystemPrompt()
  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 })
  const response = await client.responses.parse({
    model,
    reasoning: { effort: 'medium' },
    store: false,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildPaperPrompt(request) }
    ],
    text: {
      format: zodTextFormat(aiDraftSchema, 'mac_consciousness_bench_draft')
    }
  })

  if (!response.output_parsed) throw new Error('The model returned no structured draft')

  return analysisResponseSchema.parse({
    draft: response.output_parsed,
    analysis: {
      mode: 'live',
      provider: 'openai',
      model,
      reasoningEffort: 'medium',
      promptVersion: PROMPT_VERSION,
      promptDigest: await sha256Text(systemPrompt),
      responseId: response.id,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      latencyMs: Math.max(0, performance.now() - startedAt),
      store: false
    }
  })
}

export async function analyzePaper(request: AnalysisRequest): Promise<AnalysisResponse> {
  const startedAt = performance.now()
  return process.env.MAC_ANALYSIS_MODE === 'live'
    ? createLiveAnalysis(request, startedAt)
    : createMockAnalysis(request, startedAt)
}
