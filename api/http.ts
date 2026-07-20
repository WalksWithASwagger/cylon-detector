export interface ApiRequest {
  method?: string
  body: any
  headers?: Record<string, string | string[] | undefined>
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
}
