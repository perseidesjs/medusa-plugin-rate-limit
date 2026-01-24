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
	/**
	 * Whether to allow requests when cache fails (default: true)
	 */
	failOpen?: boolean
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
	resetAt: number
}

type SlidingWindowData = {
	timestamps: number[]
	windowStart: number
}

export class RateLimitError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "RateLimitError"
	}
}

export class RateLimit {
	static readonly DEFAULT_OPTIONS: PluginOptions = {
		limit: 100,
		window: 60 * 15, // 15 minutes
		prefix: "rl",
		failOpen: true,
	}

	protected readonly options_: PluginOptions
	protected readonly cacheService_: ICacheService

	constructor({ cacheService, options }: InjectedDependencies) {
		this.cacheService_ = cacheService
		this.options_ = {
			...RateLimit.DEFAULT_OPTIONS,
			...(options || {}),
		}
		this.validateOptions()
	}

	private validateOptions(): void {
		if (this.options_.limit < 0) {
			throw new RateLimitError("limit must be >= 0")
		}
		if (this.options_.window <= 0) {
			throw new RateLimitError("window must be > 0")
		}
		if (this.options_.prefix !== undefined && this.options_.prefix.length === 0) {
			throw new RateLimitError("prefix must be non-empty")
		}
	}

	private validateIdentifier(identifier: string): void {
		if (!identifier || typeof identifier !== "string") {
			throw new RateLimitError("identifier must be a non-empty string")
		}
	}

	/**
	 * Limit the request to the given identifier using sliding window timestamps
	 */
	async limit(identifier: string): Promise<RateLimitResult> {
		this.validateIdentifier(identifier)

		const key = `${this.options_.prefix}:${identifier}`
		const now = Date.now()
		const windowMs = this.options_.window * 1000
		const windowStart = now - windowMs
		const resetAt = Math.ceil((now + windowMs) / 1000)

		try {
			const cached = await this.cacheService_.get<SlidingWindowData | number>(key)

			let timestamps: number[] = []

			// Legacy migration: handle old counter format
			if (typeof cached === "number") {
				// Can't migrate counter to timestamps, treat as fresh
				timestamps = []
			} else if (cached && Array.isArray(cached.timestamps)) {
				// Filter to only timestamps within current window
				timestamps = cached.timestamps.filter((ts) => ts > windowStart)
			}

			const currentCount = timestamps.length

			if (currentCount >= this.options_.limit) {
				return {
					success: false,
					remaining: 0,
					limit: this.options_.limit,
					resetAt,
				}
			}

			// Add current request timestamp
			timestamps.push(now)

			const data: SlidingWindowData = { timestamps, windowStart: now }
			await this.cacheService_.set(key, data, this.options_.window)

			const remaining = Math.max(0, this.options_.limit - timestamps.length)
			return {
				success: true,
				remaining,
				limit: this.options_.limit,
				resetAt,
			}
		} catch (error) {
			if (this.options_.failOpen) {
				return {
					success: true,
					remaining: this.options_.limit,
					limit: this.options_.limit,
					resetAt,
				}
			}
			throw error
		}
	}

	/**
	 * Get the remaining requests for the given identifier
	 */
	async getRemaining(identifier: string): Promise<number> {
		this.validateIdentifier(identifier)

		const key = `${this.options_.prefix}:${identifier}`
		const now = Date.now()
		const windowMs = this.options_.window * 1000
		const windowStart = now - windowMs

		try {
			const cached = await this.cacheService_.get<SlidingWindowData | number>(key)

			if (typeof cached === "number") {
				return Math.max(0, this.options_.limit - cached)
			}

			if (cached && Array.isArray(cached.timestamps)) {
				const validTimestamps = cached.timestamps.filter((ts) => ts > windowStart)
				return Math.max(0, this.options_.limit - validTimestamps.length)
			}

			return this.options_.limit
		} catch {
			return this.options_.limit
		}
	}

	/**
	 * Reset the request count for the given identifier
	 */
	async reset(identifier: string): Promise<void> {
		this.validateIdentifier(identifier)

		const key = `${this.options_.prefix}:${identifier}`

		try {
			await this.cacheService_.invalidate(key)
		} catch {
			// Ignore reset errors
		}
	}
}
