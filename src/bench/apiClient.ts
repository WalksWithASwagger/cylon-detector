import { analysisResponseSchema, type AnalysisResponse } from './analysis'
import { createMockAnalysis } from './mockAnalysis'
import { toLegacyAnalysisRequest, type AnalysisRequestV2 } from './v2/contracts'
import { requestLocalOpenAiCompatibleAnalysis } from './research'

export type AnalysisTransport = 'local' | 'server' | 'local-proxy'

export async function requestAnalysis(
  request: AnalysisRequestV2,
  transport: AnalysisTransport,
  accessToken?: string,
  localConfiguration?: unknown
): Promise<AnalysisResponse> {
  if (transport === 'local') return createMockAnalysis(toLegacyAnalysisRequest(request))
  if (transport === 'local-proxy') return requestLocalOpenAiCompatibleAnalysis(localConfiguration, request)
  if (!accessToken) throw new Error('Enter the server analysis access token.')

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(request)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Analysis route returned HTTP ${response.status}`
    throw new Error(message)
  }
  return analysisResponseSchema.parse(body)
}
