const BASE_URL = import.meta.env.VITE_API_URL || ''

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isSupermanSessionError(err: unknown): boolean {
  return err instanceof ApiError
    && (err.status === 428 || err.code === 'SUPERMAN_SESSION_REQUIRED')
}

function getToken(): string | null {
  try { return localStorage.getItem('auth_token') } catch { return null }
}

function handleUnauthorized() {
  try {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  } catch { /* ignore */ }
  window.location.href = '/login'
}

function parseErrorDetail(body: { detail?: unknown }): { message: string; code?: string } {
  const detail = body?.detail
  if (typeof detail === 'string') {
    return { message: detail }
  }
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    const message = typeof record.message === 'string'
      ? record.message
      : JSON.stringify(detail)
    const code = typeof record.code === 'string' ? record.code : undefined
    return { message, code }
  }
  return { message: 'Request failed' }
}

async function handleErrorResponse(res: Response, path: string, method: string): Promise<never> {
  const body = await res.json().catch(() => ({ detail: res.statusText }))
  const { message, code } = parseErrorDetail(body)
  console.error(`[client] ${method} ${path} failed:`, body)

  if (res.status === 428 || code === 'SUPERMAN_SESSION_REQUIRED') {
    throw new ApiError(message || 'Session Superman belum aktif', 428, code || 'SUPERMAN_SESSION_REQUIRED')
  }

  if (res.status === 401) {
    handleUnauthorized()
    throw new ApiError('Sesi berakhir, silakan login kembali', 401)
  }

  throw new ApiError(message || `Request failed: ${res.status}`, res.status, code)
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers, ...options })

  if (!res.ok) {
    await handleErrorResponse(res, path, options?.method || 'GET')
  }
  return res.json()
}

export const client = {
  get<T>(path: string): Promise<T> {
    return request<T>(path)
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },

  streamBlob(path: string): Promise<Blob> {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${BASE_URL}${path}`, { headers }).then((res) => res.blob())
  },

  async uploadFormData<T>(path: string, formData: FormData): Promise<T> {
    const url = `${BASE_URL}${path}`
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(url, { method: 'POST', body: formData, headers })
    if (!res.ok) {
      await handleErrorResponse(res, path, 'POST')
    }
    return res.json()
  },
}