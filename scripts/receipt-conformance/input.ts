import { lstat, open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { ReceiptConformanceError } from './errors'

export const MAX_RECEIPT_INPUT_BYTES = 2 * 1024 * 1024

export interface PublicationTarget {
  destination: string
}

export function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReceiptConformanceError('INPUT_INVALID', `${label} must be an object.`)
  }
  return input as Record<string, unknown>
}

export function terminalValue(value: string, maximumLength = 120): string {
  const encoded = JSON.stringify(value).slice(1, -1).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
  return encoded.length <= maximumLength
    ? encoded
    : `${encoded.slice(0, maximumLength - 3)}...`
}

export function parseReceiptInput(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown
  } catch (error) {
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt input is not valid JSON.', error)
  }
}

export function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

export async function readReceiptInputFile(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) {
      throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt input must be a regular file.')
    }
    if (metadata.size > MAX_RECEIPT_INPUT_BYTES) {
      throw new ReceiptConformanceError(
        'INPUT_TOO_LARGE',
        `Receipt input exceeds the ${MAX_RECEIPT_INPUT_BYTES}-byte CLI limit.`
      )
    }

    const chunks: Buffer[] = []
    const buffer = Buffer.alloc(64 * 1024)
    let total = 0
    while (total <= MAX_RECEIPT_INPUT_BYTES) {
      const remaining = MAX_RECEIPT_INPUT_BYTES + 1 - total
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, remaining), total)
      if (bytesRead === 0) break
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)))
      total += bytesRead
      if (total > MAX_RECEIPT_INPUT_BYTES) {
        throw new ReceiptConformanceError(
          'INPUT_TOO_LARGE',
          `Receipt input exceeds the ${MAX_RECEIPT_INPUT_BYTES}-byte CLI limit.`
        )
      }
    }
    return Buffer.concat(chunks, total).toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function assertDestinationAbsent(destination: string): Promise<void> {
  try {
    await lstat(destination)
    throw new ReceiptConformanceError(
      'OUTPUT_CONFLICT',
      `Output destination ${terminalValue(destination)} already exists; caller data was not changed.`
    )
  } catch (error) {
    if (error instanceof ReceiptConformanceError) throw error
    if (isFileSystemError(error, 'ENOENT')) return
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      `Output destination ${terminalValue(destination)} could not be inspected; caller data was not changed.`,
      error
    )
  }
}

export async function resolvePublicationTarget(destinationInput: string): Promise<PublicationTarget> {
  const lexicalDestination = resolve(destinationInput)
  const lexicalParent = dirname(lexicalDestination)
  let stableParent: string
  try {
    stableParent = await realpath(lexicalParent)
    if (!(await stat(stableParent)).isDirectory()) throw new Error('Resolved parent is not a directory')
  } catch (error) {
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      `Output parent ${terminalValue(lexicalParent)} is unavailable; no package was published.`,
      error
    )
  }
  return {
    destination: join(stableParent, basename(lexicalDestination))
  }
}
