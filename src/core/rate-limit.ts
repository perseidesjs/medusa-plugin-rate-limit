import type { ICacheService } from "@medusajs/framework/types"

export type PluginOptions = {
	/**
	 * Maximum number of requests allowed in the time window
	 */
	limit: number
	/**
	 * Time window for rate limiting (in seconds)
	 */
	window: number
	/**
	 * Prefix for the rate limit key
	 */
	prefix?: string
}

type InjectedDependencies = {
	/**
	 * Cache service
	 */
	cacheService: ICacheService
	/**
	 * Options for the rate limit
	 */
	options?: Partial<PluginOptions>
}

export type RateLimitResult = {
	success: boolean
	remaining: number
	limit: number
}

export class RateLimit {
	static readonly DEFAULT_OPTIONS: PluginOptions = {
		limit: 100, // 100 requests per 15 minutes
		window: 60 * 15, // 15 minutes
		prefix: "rl",
	}

	protected readonly options_: PluginOptions
	protected readonly cacheService_: ICacheService

	constructor({
		cacheService,
		options,
	}: InjectedDependencies) {
		this.cacheService_ = cacheService
		this.options_ = {
			...RateLimit.DEFAULT_OPTIONS,
			...(options || {}),
		}
	}

	/**
	 * Limit the request to the given identifier
	 * @param identifier
	 * @returns
	 */
	async limit(identifier: string): Promise<RateLimitResult> {
		const key = `${this.options_.prefix}:${identifier}`
		const currentCount = (await this.cacheService_.get<number>(key)) || 0

		if (currentCount >= this.options_.limit) {
			return { success: false, remaining: 0, limit: this.options_.limit }
		}

		await this.cacheService_.set(key, currentCount + 1, this.options_.window)

		const remaining = Math.max(0, this.options_.limit - (currentCount + 1))
		return { success: true, remaining, limit: this.options_.limit }
	}

	/**
	 * Get the remaining requests for the given identifier
	 * @param identifier
	 * @returns
	 */
	async getRemaining(identifier: string): Promise<number> {
		const key = `${this.options_.prefix}:${identifier}`
		const currentCount = (await this.cacheService_.get<number>(key)) || 0
		return Math.max(0, this.options_.limit - currentCount)
	}

	/**
	 * Reset the request count for the given identifier
	 * @param identifier
	 */
	async reset(identifier: string) {
		const key = `${this.options_.prefix}:${identifier}`
		await this.cacheService_.set(key, 0, 0)
	}
}
