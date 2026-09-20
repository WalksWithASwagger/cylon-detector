import type { ApiRequest, ApiResponse } from './http'

export const SUBMIT_FIELD_LIMITS = {
  name: 200,
  email: 254,
  message: 4000
} as const

export interface SubmitLogger {
  error(message: string, details?: Record<string, unknown>): void
}

export interface SubmitHandlerDependencies {
  fetch: typeof fetch
  logger: SubmitLogger
  env: {
    TG_BOT_TOKEN?: string
    TG_CHAT_ID?: string
  }
}

const METHOD_NOT_ALLOWED = { error: 'Method not allowed' }
const INVALID_REQUEST = { error: 'Invalid feedback request' }
const MESSAGE_REQUIRED = { error: 'Message is required' }
const FIELD_TOO_LARGE = { error: 'Feedback field exceeds the maximum length' }
const PROVIDER_FAILED = { error: 'Failed to send notification' }
const INTERNAL_ERROR = {
  error: 'Internal server error',
  message: 'Failed to process form submission'
}
const UNAVAILABLE = {
  error: 'Feedback submission is unavailable',
  code: 'FEEDBACK_UNAVAILABLE'
}
const SUCCESS = {
  success: true,
  message: 'Form submitted successfully'
}

const RANDOM_EMOJIS = ['🧠', '💭', '🤔', '💡', '💥', '🔍', '🔦', '🔬', '🔭', '🔮', '🔥', '🔒', '🔖', '🔗']

type ParsedSubmitBody =
  | { ok: true; name: string; email: string; message: string }
  | { ok: false; status: 400 | 413; body: { error: string } }

function optionalStringField(
  value: unknown,
  maxLength: number
): { ok: true; value: string } | { ok: false; status: 400 | 413; body: { error: string } } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: '' }
  }
  if (typeof value !== 'string') {
    return { ok: false, status: 400, body: INVALID_REQUEST }
  }
  if (value.length > maxLength) {
    return { ok: false, status: 413, body: FIELD_TOO_LARGE }
  }
  return { ok: true, value }
}

function parseSubmitBody(body: unknown): ParsedSubmitBody {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, body: INVALID_REQUEST }
  }

  const candidate = body as Record<string, unknown>
  const name = optionalStringField(candidate.name, SUBMIT_FIELD_LIMITS.name)
  if (!name.ok) return name
  const email = optionalStringField(candidate.email, SUBMIT_FIELD_LIMITS.email)
  if (!email.ok) return email

  const message = candidate.message
  if (message === undefined || message === null || message === '') {
    return { ok: false, status: 400, body: MESSAGE_REQUIRED }
  }
  if (typeof message !== 'string') {
    return { ok: false, status: 400, body: INVALID_REQUEST }
  }
  if (message.length > SUBMIT_FIELD_LIMITS.message) {
    return { ok: false, status: 413, body: FIELD_TOO_LARGE }
  }
  if (!message.trim()) {
    return { ok: false, status: 400, body: MESSAGE_REQUIRED }
  }

  return { ok: true, name: name.value, email: email.value, message }
}

function defaultLogger(): SubmitLogger {
  return {
    error(message, details) {
      if (details) {
        console.error(message, details)
        return
      }
      console.error(message)
    }
  }
}

export function createSubmitHandler(dependencies: SubmitHandlerDependencies) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') {
      return res.status(405).json(METHOD_NOT_ALLOWED)
    }

    const parsed = parseSubmitBody(req.body)
    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.body)
    }

    const tgToken = dependencies.env.TG_BOT_TOKEN
    const chatId = dependencies.env.TG_CHAT_ID
    if (!tgToken || !chatId) {
      dependencies.logger.error('Feedback provider is not configured')
      return res.status(503).json(UNAVAILABLE)
    }

    const randomEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)]
    const telegramMessage = `
      ${randomEmoji} 📨 ${parsed.message}
      ${parsed.name ? `From: ${parsed.name}` : ''}${parsed.email ? `(${parsed.email})` : ''}
      `

    try {
      const telegramResponse = await dependencies.fetch(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: telegramMessage,
            parse_mode: 'Markdown'
          }),
        }
      )

      if (!telegramResponse.ok) {
        dependencies.logger.error('Feedback provider request failed', {
          status: telegramResponse.status
        })
        return res.status(500).json(PROVIDER_FAILED)
      }

      return res.status(200).json(SUCCESS)
    } catch {
      dependencies.logger.error('Feedback provider request failed')
      return res.status(500).json(INTERNAL_ERROR)
    }
  }
}

export default createSubmitHandler({
  fetch: globalThis.fetch.bind(globalThis),
  logger: defaultLogger(),
  env: process.env
})
