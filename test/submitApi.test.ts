import { describe, expect, it } from 'vitest'
import {
  SUBMIT_FIELD_LIMITS,
  createSubmitHandler,
  type SubmitHandlerDependencies
} from '../api/submit'
import type { ApiRequest, ApiResponse } from '../api/http'

const PERSONAL_NAME = 'Ada Feedback-Probe'
const PERSONAL_EMAIL = 'ada.feedback-probe@example.test'
const PERSONAL_MESSAGE = 'Secret personal feedback about my consciousness review.'
const AUTHORIZATION = 'Bearer secret-feedback-auth-token'
const PROVIDER_RESPONSE_BODY = 'telegram-provider-error-body-must-never-be-logged'
const BOT_TOKEN = 'test-bot-token-not-for-network'
const CHAT_ID = 'test-chat-id-not-for-network'

const FORBIDDEN_DIAGNOSTIC_FRAGMENTS = [
  PERSONAL_NAME,
  PERSONAL_EMAIL,
  PERSONAL_MESSAGE,
  AUTHORIZATION,
  'secret-feedback-auth-token',
  PROVIDER_RESPONSE_BODY,
  BOT_TOKEN,
  CHAT_ID
]

function validBody() {
  return {
    name: PERSONAL_NAME,
    email: PERSONAL_EMAIL,
    message: PERSONAL_MESSAGE
  }
}

function request(
  method: string,
  body: unknown,
  headers: ApiRequest['headers'] = { authorization: AUTHORIZATION }
): ApiRequest {
  return { method, body, headers }
}

function responseRecorder() {
  const record: { statusCode: number; body?: unknown } = { statusCode: 200 }
  const response: ApiResponse = {
    status(code) {
      record.statusCode = code
      return response
    },
    json(body) {
      record.body = body
    }
  }
  return { response, record }
}

function createLogger() {
  const entries: Array<{ message: string; details?: Record<string, unknown> }> = []
  const logger: SubmitHandlerDependencies['logger'] = {
    error(message, details) {
      entries.push({ message, details })
    }
  }
  return { logger, entries }
}

function createFetch(
  impl?: (url: string, init?: RequestInit) => Promise<Response>
) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchFn: SubmitHandlerDependencies['fetch'] = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
    calls.push({ url, init })
    if (impl) return impl(url, init)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  return { fetch: fetchFn, calls }
}

function handlerFor(options: {
  env?: SubmitHandlerDependencies['env']
  fetch?: SubmitHandlerDependencies['fetch']
  logger: SubmitHandlerDependencies['logger']
}) {
  return createSubmitHandler({
    fetch: options.fetch ?? createFetch().fetch,
    logger: options.logger,
    env: options.env ?? { TG_BOT_TOKEN: BOT_TOKEN, TG_CHAT_ID: CHAT_ID }
  })
}

function assertRedactedDiagnostics(diagnostics: unknown) {
  const serialized = JSON.stringify(diagnostics)
  for (const fragment of FORBIDDEN_DIAGNOSTIC_FRAGMENTS) {
    expect(serialized).not.toContain(fragment)
  }
}

describe('POST /api/submit', () => {
  it('rejects methods other than POST', async () => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('GET', validBody()), response)

    expect(record.statusCode).toBe(405)
    expect(record.body).toEqual({ error: 'Method not allowed' })
    expect(calls).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })

  it.each([
    ['missing body', undefined],
    ['non-object body', 'not-json'],
    ['array body', [{ message: PERSONAL_MESSAGE }]],
    ['non-string name', { ...validBody(), name: 12 }],
    ['non-string email', { ...validBody(), email: { address: PERSONAL_EMAIL } }],
    ['non-string message', { ...validBody(), message: 99 }]
  ])('rejects %s with a stable 400', async (_label, body) => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', body), response)

    expect(record.statusCode).toBe(400)
    expect(record.body).toEqual({ error: 'Invalid feedback request' })
    expect(calls).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })

  it.each([
    ['missing message', { name: PERSONAL_NAME, email: PERSONAL_EMAIL }],
    ['blank message', { ...validBody(), message: '' }],
    ['whitespace message', { ...validBody(), message: '   \n\t  ' }]
  ])('rejects %s with a stable 400', async (_label, body) => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', body), response)

    expect(record.statusCode).toBe(400)
    expect(record.body).toEqual({ error: 'Message is required' })
    expect(calls).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })

  it.each([
    ['name', { ...validBody(), name: 'N'.repeat(SUBMIT_FIELD_LIMITS.name + 1) }],
    ['email', { ...validBody(), email: `${'e'.repeat(SUBMIT_FIELD_LIMITS.email)}@x` }],
    ['message', { ...validBody(), message: 'M'.repeat(SUBMIT_FIELD_LIMITS.message + 1) }]
  ])('rejects an oversized %s with a stable 413', async (_field, body) => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', body), response)

    expect(record.statusCode).toBe(413)
    expect(record.body).toEqual({ error: 'Feedback field exceeds the maximum length' })
    expect(calls).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })

  it('returns an explicit unavailable response when Telegram is not configured', async () => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({
      logger,
      fetch,
      env: {}
    })(request('POST', validBody()), response)

    expect(record.statusCode).toBe(503)
    expect(record.body).toEqual({
      error: 'Feedback submission is unavailable',
      code: 'FEEDBACK_UNAVAILABLE'
    })
    expect(calls).toHaveLength(0)
    expect(entries).toEqual([{ message: 'Feedback provider is not configured' }])
    assertRedactedDiagnostics(entries)
  })

  it('treats partial Telegram configuration as unavailable without logging personal data', async () => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch()
    const { response, record } = responseRecorder()

    await handlerFor({
      logger,
      fetch,
      env: { TG_BOT_TOKEN: BOT_TOKEN }
    })(request('POST', validBody()), response)

    expect(record.statusCode).toBe(503)
    expect(record.body).toMatchObject({ code: 'FEEDBACK_UNAVAILABLE' })
    expect(calls).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })

  it('returns a provider failure without logging personal data or the provider body', async () => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch(async () => {
      return new Response(PROVIDER_RESPONSE_BODY, { status: 502 })
    })
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', validBody()), response)

    expect(record.statusCode).toBe(500)
    expect(record.body).toEqual({ error: 'Failed to send notification' })
    expect(calls).toHaveLength(1)
    expect(entries).toEqual([{
      message: 'Feedback provider request failed',
      details: { status: 502 }
    }])
    assertRedactedDiagnostics(entries)
  })

  it('returns a stable internal error when the provider throws, without leaking diagnostics', async () => {
    const { logger, entries } = createLogger()
    const { fetch } = createFetch(async () => {
      throw new Error(`${PERSONAL_EMAIL} provider exploded ${PROVIDER_RESPONSE_BODY}`)
    })
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', validBody()), response)

    expect(record.statusCode).toBe(500)
    expect(record.body).toEqual({
      error: 'Internal server error',
      message: 'Failed to process form submission'
    })
    expect(entries).toEqual([{ message: 'Feedback provider request failed' }])
    assertRedactedDiagnostics(entries)
  })

  it('forwards a valid submission and preserves the user-visible success contract', async () => {
    const { logger, entries } = createLogger()
    const { fetch, calls } = createFetch(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    const { response, record } = responseRecorder()

    await handlerFor({ logger, fetch })(request('POST', validBody()), response)

    expect(record.statusCode).toBe(200)
    expect(record.body).toEqual({
      success: true,
      message: 'Form submitted successfully'
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`)
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const payload = JSON.parse(String(calls[0]?.init?.body))
    expect(payload).toMatchObject({
      chat_id: CHAT_ID,
      parse_mode: 'Markdown'
    })
    expect(payload.text).toContain(PERSONAL_MESSAGE)
    expect(payload.text).toContain(PERSONAL_NAME)
    expect(payload.text).toContain(PERSONAL_EMAIL)
    expect(entries).toHaveLength(0)
    assertRedactedDiagnostics(entries)
  })
})
