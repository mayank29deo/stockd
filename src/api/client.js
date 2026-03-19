const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DEFAULT_TIMEOUT = 15000

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
    return res.json()
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

export const api = {
  get:  (path)        => request(path),
  post: (path, body)  => request(path, { method: 'POST', body: JSON.stringify(body) }),
}

export default api
