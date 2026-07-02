import { client, ApiError, isSupermanSessionError } from '@/lib/client'
import type { SupermanDeklarasiProgress, SupermanDeklarasiResult, SupermanDocRequirement } from '@/types'

export const POLL_INTERVAL_MS = 1000
export const POLL_TIMEOUT_MS = 10 * 60 * 1000
const RETRYABLE_STATUSES = new Set([502, 503, 504])
const MAX_TRANSIENT_RETRIES = 5

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface PollSupermanJobOptions {
  onProgress?: (percent: number, stage: string) => void
  isCancelled?: () => boolean
  noInvoice?: string
}

const JOB_LOST_MSG =
  'Sesi job hilang (server restart). Tutup dialog ini, lalu klik "Buat Deklarasi Superman" lagi.'

export function extractJobIdFromConflict(detail: string): string | null {
  const m = detail.match(/job_id=([0-9a-f-]{36})/i)
  return m?.[1] ?? null
}

export function formatMissingSupermanDocs(requirements: SupermanDocRequirement[]): string {
  const missing = requirements
    .filter((r) => r.required !== false && !r.uploaded)
    .map((r) => r.upload_hint || r.label.replace(' (opsional)', ''))
  if (!missing.length) {
    return 'Upload dokumen wajib terlebih dahulu sebelum membuat SPPn Superman.'
  }
  return `Dokumen wajib belum lengkap: ${missing.join('; ')}`
}

export async function checkSupermanDocsReady(noInvoice: string): Promise<{
  ready: boolean
  message: string
  requirements: SupermanDocRequirement[]
}> {
  const params = new URLSearchParams({ no_invoice: noInvoice })
  const res = await client.get<{ ready: boolean; requirements: SupermanDocRequirement[] }>(
    `/api/superman/doc-requirements?${params.toString()}`,
  )
  const message = res.ready ? '' : formatMissingSupermanDocs(res.requirements)
  return { ready: res.ready, message, requirements: res.requirements }
}

export function isSupermanSessionMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('captcha') || lower.includes('session superman')
}

export async function pollSupermanJob(
  jobId: string,
  options?: PollSupermanJobOptions,
): Promise<SupermanDeklarasiResult> {
  const startedAt = Date.now()
  let transientRetries = 0

  while (true) {
    if (options?.isCancelled?.()) {
      throw new Error('Proses dibatalkan')
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('Timeout: proses Superman melebihi 10 menit. Coba lagi atau pulihkan dari To Do List.')
    }

    try {
      let progress: SupermanDeklarasiProgress
      try {
        progress = await client.get<SupermanDeklarasiProgress>(
          `/api/superman/deklarasi/progress?job_id=${encodeURIComponent(jobId)}`,
        )
      } catch (inner) {
        if (
          inner instanceof ApiError
          && inner.status === 404
          && options?.noInvoice
        ) {
          progress = await client.get<SupermanDeklarasiProgress>(
            `/api/superman/deklarasi/progress?no_invoice=${encodeURIComponent(options.noInvoice)}`,
          )
        } else {
          throw inner
        }
      }
      transientRetries = 0
      options?.onProgress?.(progress.percent, progress.stage)

      if (progress.status === 'completed' && progress.result) {
        options?.onProgress?.(100, 'Selesai')
        return progress.result
      }
      if (progress.status === 'failed') {
        throw new Error(progress.error || 'Gagal membuat SPPn di Superman')
      }
    } catch (err) {
      if (err instanceof ApiError && isSupermanSessionError(err)) {
        throw err
      }
      if (err instanceof ApiError && err.status === 404) {
        throw new Error(JOB_LOST_MSG)
      }
      if (
        err instanceof ApiError
        && RETRYABLE_STATUSES.has(err.status)
        && transientRetries < MAX_TRANSIENT_RETRIES
      ) {
        transientRetries += 1
        await sleep(POLL_INTERVAL_MS * transientRetries)
        continue
      }
      throw err
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

export async function recoverSupermanFromTodo(noInvoice: string): Promise<{
  ok: boolean
  superman_saved?: string
  message?: string
}> {
  const params = new URLSearchParams({ no_invoice: noInvoice })
  return client.post(`/api/superman/recover?${params.toString()}`)
}