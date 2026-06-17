const BASE_URL = import.meta.env.VITE_API_URL || ''

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, { headers, ...options })

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('Sesi berakhir, silakan login kembali')
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }))
    console.error(`[client] ${options?.method || 'GET'} ${path} failed:`, detail)
    throw new Error(detail.detail || `Request failed: ${res.status}`)
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
    if (res.status === 401) {
      handleUnauthorized()
      throw new Error('Sesi berakhir, silakan login kembali')
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }))
      console.error(`[client] POST ${path} failed:`, detail)
      throw new Error(detail.detail || `Request failed: ${res.status}`)
    }
    return res.json()
  },
}
