# Webhooks

Wayfarer can send a signed JSON `POST` when a download completes or fails. Set `WAYFARER_WEBHOOK_URL`, and optionally `WAYFARER_WEBHOOK_SECRET` (at least 16 characters) to sign requests.

## Payload

```json
{
  "event": "download.completed",
  "timestamp": "2026-11-19T09:13:26.882Z",
  "download": {
    "id": "cab85161-1848-4864-8625-d1760f92d552",
    "filename": "archive.zip",
    "host": "files.example.com",
    "resolver": "direct",
    "totalBytes": 102261,
    "downloadedBytes": 102261,
    "sha256": null,
    "error": null
  }
}
```

`event` is `download.completed` or `download.failed`. A failed download carries `error: { code, message }`. `sha256` is only set when a checksum was verified. The payload never includes the link, which may hold tokens, or any file path.

## Headers

| Header                 | Value                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `X-Wayfarer-Event`     | The event name.                                                                        |
| `X-Wayfarer-Delivery`  | A unique id, repeated on retries.                                                      |
| `X-Wayfarer-Timestamp` | Unix seconds.                                                                          |
| `X-Wayfarer-Signature` | `sha256=` plus the hex HMAC-SHA256 of `<timestamp>.<body>`, only when a secret is set. |

## Verify a request

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verify(secret: string, headers: Headers, rawBody: string): boolean {
  const timestamp = headers.get('x-wayfarer-timestamp') ?? ''
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`)
  const actual = Buffer.from(headers.get('x-wayfarer-signature') ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
```

## Delivery rules

- The target must pass the network policy. A receiver on your LAN or loopback needs `WAYFARER_ALLOW_PRIVATE_NETWORKS`.
- Redirects are never followed.
- Network errors, timeouts, HTTP 5xx, 408 and 429 are retried after 1 s and then 5 s. Other statuses fail at once.
- Failures are logged without the URL. Pending deliveries get up to 5 seconds at shutdown.
