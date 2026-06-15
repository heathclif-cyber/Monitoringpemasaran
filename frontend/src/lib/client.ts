const BASE_URL = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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
    return fetch(`${BASE_URL}${path}`).then((res) => res.blob())
  },

  async uploadFormData<T>(path: string, formData: FormData): Promise<T> {
    const url = `${BASE_URL}${path}`
    const res = await fetch(url, { method: 'POST', body: formData })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }))
      console.error(`[client] POST ${path} failed:`, detail)
      throw new Error(detail.detail || `Request failed: ${res.status}`)
    }
    return res.json()
  },
}
