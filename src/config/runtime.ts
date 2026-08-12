import type { ApiMode } from '../types/api'

const requestedMode = String(import.meta.env.VITE_API_MODE || 'real').toLowerCase()

export const runtimeConfig = {
  apiMode: (requestedMode === 'real' ? 'real' : 'mock') as ApiMode,
  apiBaseUrl: String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  mockDelay: Number(import.meta.env.VITE_MOCK_DELAY || 260),
}
