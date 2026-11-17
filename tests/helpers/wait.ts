/**
 * Polls `condition` until it is true.
 *
 * @throws {Error} when it is still false after `timeoutMs`.
 */
export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition')
    await Bun.sleep(5)
  }
}
