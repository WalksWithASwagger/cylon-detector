import { z } from 'zod'
import { analysisResponseSchema, type AnalysisResponse } from './analysis'
import { reviewStateSchema, paperSourceSchema, stableStringify } from './artifact'
import type { ReviewState } from './adjudication'
import { benchmarkDefinition } from './benchmark'
import { sha256Text } from './hash'
import { verifiedCitationSchema, type AnalysisRequest, type VerifiedCitation } from './schema'
import { reviewEventV2Schema, type ReviewEventV2 } from './v2/artifact'

export const checkpointSchema = z.object({
  schemaVersion: z.literal('cylon-checkpoint/v1'),
  checkpointId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  savedAt: z.string().datetime(),
  benchmark: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    digest: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  paper: paperSourceSchema,
  analysis: analysisResponseSchema,
  verifiedCitations: z.array(verifiedCitationSchema),
  humanReview: reviewStateSchema,
  reviewEvents: z.array(reviewEventV2Schema).optional(),
  privacy: z.object({
    pdfBytesStored: z.literal(false),
    fullTextStored: z.literal(false),
    resumeRequiresHashMatch: z.literal(true)
  })
})

export type BenchCheckpoint = z.infer<typeof checkpointSchema>

interface CreateCheckpointInput {
  checkpointId: string
  runId?: string
  savedAt?: string
  paper: AnalysisRequest['paper']
  analysis: AnalysisResponse
  verifiedCitations: VerifiedCitation[]
  review: ReviewState
  reviewEvents?: ReviewEventV2[]
}

export async function createCheckpoint(input: CreateCheckpointInput): Promise<BenchCheckpoint> {
  const { pages: _pages, ...paper } = input.paper
  return checkpointSchema.parse({
    schemaVersion: 'cylon-checkpoint/v1',
    checkpointId: input.checkpointId,
    ...(input.runId ? { runId: input.runId } : {}),
    savedAt: input.savedAt ?? new Date().toISOString(),
    benchmark: {
      id: benchmarkDefinition.id,
      version: benchmarkDefinition.version,
      digest: await sha256Text(stableStringify(benchmarkDefinition))
    },
    paper,
    analysis: input.analysis,
    verifiedCitations: input.verifiedCitations,
    humanReview: input.review,
    ...(input.reviewEvents ? { reviewEvents: input.reviewEvents } : {}),
    privacy: {
      pdfBytesStored: false,
      fullTextStored: false,
      resumeRequiresHashMatch: true
    }
  })
}

export function checkpointPaperMatches(
  paper: AnalysisRequest['paper'],
  checkpoint: BenchCheckpoint
): boolean {
  return paper.sha256 === checkpoint.paper.sha256 &&
    paper.textSha256 === checkpoint.paper.textSha256 &&
    paper.pageCount === checkpoint.paper.pageCount
}

interface CheckpointDatabase {
  put(checkpoint: BenchCheckpoint): Promise<void>
  get(checkpointId: string): Promise<BenchCheckpoint | undefined>
  list(): Promise<BenchCheckpoint[]>
  delete(checkpointId: string): Promise<void>
  clear(): Promise<void>
}

const databaseName = 'cylon-detector'
const storeName = 'checkpoints'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(databaseName, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(storeName)) {
      request.result.createObjectStore(storeName, { keyPath: 'checkpointId' })
    }
  }
  return requestResult(request)
}

export function browserCheckpointDatabase(): CheckpointDatabase {
  async function withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const database = await openDatabase()
    try {
      return await requestResult(operation(database.transaction(storeName, mode).objectStore(storeName)))
    } finally {
      database.close()
    }
  }

  return {
    async put(checkpoint) {
      await withStore('readwrite', store => store.put(checkpoint))
    },
    async get(checkpointId) {
      const candidate = await withStore<unknown>('readonly', store => store.get(checkpointId))
      return candidate === undefined ? undefined : checkpointSchema.parse(candidate)
    },
    async list() {
      const candidates = await withStore<unknown[]>('readonly', store => store.getAll())
      return candidates.map(candidate => checkpointSchema.parse(candidate))
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    },
    async delete(checkpointId) {
      await withStore('readwrite', store => store.delete(checkpointId))
    },
    async clear() {
      await withStore('readwrite', store => store.clear())
    }
  }
}
