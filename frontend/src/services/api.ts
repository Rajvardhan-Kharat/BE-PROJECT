export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Session expired or invalid credentials (401). Please re-authenticate.') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends ApiError {
  constructor(
    message = 'Access denied (403): Role, scope, or consent requirements not met. This denial is audited.',
    data?: unknown
  ) {
    super(403, message, data)
    this.name = 'ForbiddenError'
  }
}

type UnauthorizedHandler = () => void
type ForbiddenHandler = (error: ForbiddenError) => void

class ApiClient {
  private baseUrl: string
  private token: string | null = null
  private onUnauthorizedCallbacks: Set<UnauthorizedHandler> = new Set()
  private onForbiddenCallbacks: Set<ForbiddenHandler> = new Set()

  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl
  }

  setToken(token: string | null) {
    this.token = token
  }

  getToken(): string | null {
    return this.token
  }

  onUnauthorized(cb: UnauthorizedHandler): () => void {
    this.onUnauthorizedCallbacks.add(cb)
    return () => this.onUnauthorizedCallbacks.delete(cb)
  }

  onForbidden(cb: ForbiddenHandler): () => void {
    this.onForbiddenCallbacks.add(cb)
    return () => this.onForbiddenCallbacks.delete(cb)
  }

  private triggerUnauthorized() {
    this.onUnauthorizedCallbacks.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.error('Error in onUnauthorized callback:', err)
      }
    })
  }

  private triggerForbidden(err: ForbiddenError) {
    this.onForbiddenCallbacks.forEach((cb) => {
      try {
        cb(err)
      } catch (e) {
        console.error('Error in onForbidden callback:', e)
      }
    })
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    if (this.baseUrl.endsWith('/api/v1') && cleanEndpoint.startsWith('/api/v1/')) {
      cleanEndpoint = cleanEndpoint.substring('/api/v1'.length)
    }

    const url = cleanEndpoint.startsWith('http')
      ? cleanEndpoint
      : `${this.baseUrl}${cleanEndpoint}`

    const headers = new Headers(options.headers || {})
    headers.set('Content-Type', 'application/json')

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers,
      })
    } catch (networkErr: unknown) {
      throw new ApiError(0, networkErr instanceof Error ? networkErr.message : 'Network request failed')
    }

    if (response.status === 401) {
      this.triggerUnauthorized()
      throw new UnauthorizedError()
    }

    if (response.status === 403) {
      let errorData: unknown
      try {
        errorData = await response.json()
      } catch {
        // Response may be empty or non-JSON
      }
      const forbiddenErr = new ForbiddenError(
        'Access denied: Role, care team scope, or consent check failed (audited).',
        errorData
      )
      this.triggerForbidden(forbiddenErr)
      throw forbiddenErr
    }

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = await response.text()
      }
      throw new ApiError(
        response.status,
        `Request failed with status ${response.status}`,
        errorBody
      )
    }

    // If 204 No Content
    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  get<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers })
  }

  post<T>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    })
  }

  put<T>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    })
  }

  delete<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', headers })
  }
}

export const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || '/api/v1')
