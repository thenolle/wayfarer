import { UnsupportedUrlError } from '../http/errors'
import { BuzzheavierResolver } from './buzzheavier'
import { MediafireResolver } from './mediafire'
import { DirectResolver } from './direct'
import type { ResolvedSource, ResolverContext, UrlResolver } from './types'

/**
 * Ordered collection of resolvers. Registration order is precedence: the
 * first resolver whose `canResolve` accepts the URL is used, and the fallback
 * (the direct resolver by default) handles everything else.
 */
export class ResolverRegistry {
	private readonly resolvers: UrlResolver[] = []

	constructor(initial: readonly UrlResolver[] = [], private readonly fallback: UrlResolver = new DirectResolver()) {
		for (const resolver of initial) this.register(resolver)
	}

	/**
	 * @throws {Error} when a resolver with the same name is already registered.
	 */
	register(resolver: UrlResolver): void {
		if (this.resolvers.some((existing) => existing.name === resolver.name)) throw new Error(`A resolver named "${resolver.name}" is already registered`)
		this.resolvers.push(resolver)
	}

	/**
	 * @throws {UnsupportedUrlError} when no resolver accepts the URL.
	 */
	find(url: URL): UrlResolver {
		const match = this.resolvers.find((resolver) => resolver.canResolve(url))
		if (match !== undefined) return match
		if (this.fallback.canResolve(url)) return this.fallback
		throw new UnsupportedUrlError()
	}

	resolve(url: URL, context: ResolverContext): Promise<ResolvedSource> {
		return this.find(url).resolve(url, context)
	}
}

/**
 * The resolvers Wayfarer ships with, in precedence order. Add new providers here.
 */
export function createDefaultResolvers(): ResolverRegistry {
	return new ResolverRegistry([new BuzzheavierResolver(), new MediafireResolver()])
}
