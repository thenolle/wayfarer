/**
 * Changes a response's headers without touching its body.
 *
 * The headers are edited in place whenever possible. Rebuilding a response from
 * `response.body` would turn a file body into a plain stream and lose the
 * content type Bun infers from the file. Only responses with read-only headers
 * are copied.
 */
export function withHeaders(response: Response, apply: (headers: Headers) => void): Response {
  try {
    apply(response.headers)
    return response
  } catch {
    const headers = new Headers(response.headers)
    apply(headers)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
