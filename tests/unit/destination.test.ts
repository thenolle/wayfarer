import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { allocateDestination, splitExtension } from '../../src/filesystem/destination'
import { DestinationExistsError, PathEscapeError } from '../../src/filesystem/errors'
import { finalizePartFile } from '../../src/filesystem/finalize'
import { partPathFor, resolveWithin } from '../../src/filesystem/paths'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wayfarer-fs-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('allocateDestination', () => {
  test('returns the requested name when it is free', async () => {
    expect(basename(await allocateDestination(directory, 'archive.zip'))).toBe('archive.zip')
  })

  test('numbers names that collide, ignoring case', async () => {
    await writeFile(join(directory, 'archive.zip'), 'x')
    expect(basename(await allocateDestination(directory, 'ARCHIVE.zip'))).toBe('ARCHIVE (1).zip')
    await writeFile(join(directory, 'archive (1).zip'), 'x')
    expect(basename(await allocateDestination(directory, 'archive.zip'))).toBe('archive (2).zip')
  })

  test('treats an existing part file as taken', async () => {
    await writeFile(partPathFor(join(directory, 'movie.mkv')), 'x')
    expect(basename(await allocateDestination(directory, 'movie.mkv'))).toBe('movie (1).mkv')
  })

  test('respects reserved paths from other downloads', async () => {
    const reserved = [join(directory, 'data.bin')]
    expect(basename(await allocateDestination(directory, 'data.bin', reserved))).toBe('data (1).bin')
  })

  test('keeps compound tar extensions together', () => {
    expect(splitExtension('backup.tar.gz')).toEqual({ stem: 'backup', extension: '.tar.gz' })
    expect(splitExtension('notes')).toEqual({ stem: 'notes', extension: '' })
  })

  test('works when the directory does not exist yet', async () => {
    const missing = join(directory, 'missing')
    expect(basename(await allocateDestination(missing, 'a.txt'))).toBe('a.txt')
  })
})

describe('finalizePartFile', () => {
  test('moves the part file to the destination', async () => {
    const destination = join(directory, 'done.bin')
    const part = partPathFor(destination)
    await writeFile(part, 'payload')
    await finalizePartFile(part, destination)
    expect(await readFile(destination, 'utf8')).toBe('payload')
    expect(stat(part)).rejects.toThrow()
  })

  test('refuses to overwrite an existing file', async () => {
    const destination = join(directory, 'taken.bin')
    const part = partPathFor(destination)
    await writeFile(destination, 'original')
    await writeFile(part, 'new')
    expect(finalizePartFile(part, destination)).rejects.toBeInstanceOf(DestinationExistsError)
    expect(await readFile(destination, 'utf8')).toBe('original')
  })
})

describe('resolveWithin', () => {
  test('accepts names inside the root', () => {
    expect(resolveWithin(directory, 'file.txt')).toBe(join(directory, 'file.txt'))
  })

  test('rejects traversal and the root itself', () => {
    expect(() => resolveWithin(directory, '../outside.txt')).toThrow(PathEscapeError)
    expect(() => resolveWithin(directory, '.')).toThrow(PathEscapeError)
  })
})
