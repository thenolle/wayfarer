/**
 * Computes the SHA-256 digest of a file as lowercase hex, streaming it so
 * memory use stays constant regardless of file size.
 *
 * @throws the signal's reason if `signal` aborts while hashing.
 */
export async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256')
  const reader = Bun.file(path).stream().getReader()
  try {
    for (;;) {
      signal?.throwIfAborted()
      const result = await reader.read()
      if (result.done) break
      hasher.update(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  return hasher.digest('hex')
}
