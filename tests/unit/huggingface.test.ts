import { describe, expect, test } from 'bun:test'
import { HuggingFaceResolver } from '../../src/downloads/resolvers/huggingface'

describe('HuggingFaceResolver', () => {
	const resolver = new HuggingFaceResolver()

	test('claims file links only', () => {
		expect(resolver.canResolve(new URL('https://huggingface.co/owner/repo/blob/main/model.bin'))).toBe(true)
		expect(resolver.canResolve(new URL('https://hf.co/datasets/owner/repo/resolve/main/data.csv'))).toBe(true)
		expect(resolver.canResolve(new URL('https://huggingface.co/owner/repo'))).toBe(false)
		expect(resolver.canResolve(new URL('https://huggingface.co/owner/repo/tree/main'))).toBe(false)
		expect(resolver.canResolve(new URL('https://evil.test/owner/repo/blob/main/model.bin'))).toBe(false)
	})

	test('rewrites blob links to download links and names the file', async () => {
		const source = await resolver.resolve(new URL('https://huggingface.co/datasets/owner/repo/blob/main/data/train%20set.parquet?x=1'))
		expect(source.url).toBe('https://huggingface.co/datasets/owner/repo/resolve/main/data/train%20set.parquet?download=true')
		expect(source.filenameHint).toBe('train set.parquet')
	})

	test('handles models, spaces, shortened hosts and existing resolve links', async () => {
		expect((await resolver.resolve(new URL('https://huggingface.co/owner/repo/blob/v1.0/weights/a.safetensors'))).url).toBe('https://huggingface.co/owner/repo/resolve/v1.0/weights/a.safetensors?download=true')
		expect((await resolver.resolve(new URL('https://huggingface.co/spaces/owner/app/blob/main/app.py'))).url).toBe('https://huggingface.co/spaces/owner/app/resolve/main/app.py?download=true')
		expect((await resolver.resolve(new URL('https://hf.co/owner/repo/resolve/main/a.bin?download=true'))).url).toBe('https://huggingface.co/owner/repo/resolve/main/a.bin?download=true')
	})
})
