import { TransactionBaseService } from '@medusajs/medusa'
import type { Redis } from 'ioredis'

import type { PluginOptions } from '../types/options'

/**
 * Dependencies injected into the RateLimitService.
 */
type InjectedDependencies = {
	redisClient: Redis
}

/**
 * Service for managing rate limiting functionality.
 * @extends TransactionBaseService
 */
class RateLimitService extends TransactionBaseService {
	/** The Redis client used for rate limiting operations. */
	protected readonly redisClient_: Redis

	/**
	 * Default options for rate limiting.
	 * @default { limit: 5, window: 60 } - 5 requests per minute (60 seconds window) before blocking
	 *
	 */
	private readonly options_: PluginOptions = {
		limit: 5,
		window: 60,
	}

	/**
	 * Creates an instance of RateLimitService.
	 * @param {InjectedDependencies} container - The injected dependencies.
	 * @param {PluginOptions} options - The options for rate limiting.
	 */
	constructor(container: InjectedDependencies, options: PluginOptions) {
		super(container)

		// We will always have a redis client available (FakeRedis in any case)
		this.redisClient_ = container.redisClient

		if (options) {
			this.options_ = { ...this.options_, ...options }
		}
	}

	/**
	 * Limits the number of attempts for the given key.
	 * @param {string} key - The key to limit.
	 * @returns {Promise<boolean>} True if the limit is not exceeded, false otherwise.
	 */
	async limit(key: string): Promise<boolean> {
		const current = await this.redisClient_.incr(key)
		if (current === 1) {
			await this.redisClient_.expire(key, this.options_.window)
		}

		return current <= this.options_.limit
	}

	/**
	 * Returns the number of remaining attempts for the given key.
	 * @param {string} key - The key to check.
	 * @returns {Promise<number>} The number of remaining attempts.
	 */
	async getRemainingAttempts(key: string): Promise<number> {
		const count = await this.redisClient_.get(key)
		return count ? this.options_.limit - parseInt(count) : this.options_.limit
	}

	/**
	 * Resets the limit for the given key.
	 * @param {string} key - The key to reset.
	 * @returns {Promise<void>}
	 */
	async resetLimit(key: string): Promise<void> {
		await this.redisClient_.del(key)
	}

	/**
	 * Returns the time to live of the given key in seconds.
	 * @param {string} key - The key to check.
	 * @returns {Promise<number>} The time to live in seconds.
	 */
	async ttl(key: string): Promise<number> {
		return await this.redisClient_.ttl(key)
	}

	getOptions(): PluginOptions {
		return this.options_
	}
}

export default RateLimitService
