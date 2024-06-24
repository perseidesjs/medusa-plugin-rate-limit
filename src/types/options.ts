/**
 * ### Description
 * Options for the rate limiting service (optional).
 * #### Default to `{ limit: 5, window: 60 }`
 *
 * ### Example
 * In the following, it means that you can make `5` requests per minute before blocking.
 *
 * ```js
 * {
 *   resolve: `medusa-plugin-ratelimit`,
 *   options: {
 *     limit: 5,
 *     window: 60,
 *   },
 * }
 * ```
 */
export type PluginOptions = {
	/**
	 * ### Description
	 * The number of requests allowed per time window.
	 * #### Default to `5`
	 *
	 * ### Example
	 * You have `limit` of `5` and `window` of `60` seconds, it means that you can make `5` requests per minute before blocking.
	 */
	limit?: number
	/**
	 * ### Description
	 * The time window in seconds for rate limiting.
	 * #### Default to `60`
	 *
	 * ### Example
	 * You have `limit` of `5` and `window` of `60` seconds, it means that you can make `5` requests per minute before blocking.
	 */
	window?: number
}
