import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'
import { findClientDir, missingClientAssets } from '../../src/config/client-dir'

const root = resolve('/wayfarer-test')

function existing(...directories: string[]): (path: string) => boolean {
  const files = new Set(directories.map((directory) => join(directory, 'client.js')))
  return (path) => files.has(path)
}

describe('findClientDir', () => {
  test('prefers the directory beside the server bundle', () => {
    const bundle = join(root, 'dist', 'server')
    const expected = join(root, 'dist', 'client')
    expect(findClientDir(bundle, '/somewhere/else', existing(expected))).toBe(expected)
  })

  test('finds the build output when running from source', () => {
    const source = join(root, 'src', 'config')
    const expected = join(root, 'dist', 'client')
    expect(findClientDir(source, '/somewhere/else', existing(expected))).toBe(expected)
  })

  test('falls back to the working directory, with or without files', () => {
    const cwd = join(root, 'cwd')
    const expected = join(cwd, 'dist', 'client')
    expect(findClientDir('/nowhere/a', cwd, existing(expected))).toBe(expected)
    expect(findClientDir('/nowhere/a', cwd, () => false)).toBe(expected)
  })
})

describe('missingClientAssets', () => {
  test('lists the files that are not there', () => {
    const directory = join(root, 'client')
    expect(missingClientAssets(directory, () => false)).toEqual(['client.js', 'app.css'])
    expect(missingClientAssets(directory, (path) => path === join(directory, 'client.js'))).toEqual(['app.css'])
    expect(missingClientAssets(directory, () => true)).toEqual([])
  })
})
