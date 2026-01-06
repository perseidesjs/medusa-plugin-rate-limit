import type {
	MedusaNextFunction,
	MedusaRequest,
	MedusaResponse,
} from "@medusajs/framework/http"
import type { ICacheService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { type PluginOptions, RateLimit } from "../../core/rate-limit"

export type IpRateLimitOptions = Partial<PluginOptions> & {
	/**
	 * Whether to trust the X-Forwarded-For header.
	 * - `false` (default): Always use the direct connection IP (req.socket.remoteAddress)
	 * - `true`: Use the leftmost IP from X-Forwarded-For (use only if your proxy overwrites the header)
	 * - `number`: Number of trusted proxy hops. The client IP is extracted from the right side of the header.
	 *   For example, if you have 1 reverse proxy, set this to 1.
	 *
	 * WARNING: Only enable this if your server is behind a trusted reverse proxy.
	 * Enabling this without a proxy allows clients to spoof their IP and bypass rate limiting.
	 */
	trustProxy?: boolean | number
}

/**
 * Extracts the client IP address from the request
 * @param req - The request object
 * @param trustProxy - Whether to trust the X-Forwarded-For header
 * @returns The client IP address
 */
function getClientIp(req: MedusaRequest, trustProxy: boolean | number = false): string {
	const directIp = req.socket.remoteAddress || "unknown"

	if (!trustProxy) {
		return directIp
	}

	const forwardedFor = req.headers["x-forwarded-for"]
	if (!forwardedFor) {
		return directIp
	}

	const forwardedIps = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
		.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean)

	if (forwardedIps.length === 0) {
		return directIp
	}

	if (trustProxy === true) {
		// Trust the leftmost IP (assumes proxy overwrites/sanitizes the header)
		return forwardedIps[0]
	}

	// trustProxy is a number: count from the right
	// e.g., trustProxy=1 means 1 proxy hop, so take the rightmost-1 IP (or the only IP if just one)
	const index = Math.max(0, forwardedIps.length - trustProxy)
	return forwardedIps[index] || directIp
}

/**
 * Default rate limit middleware that uses the IP address as the identifier
 * @param options - The options for the rate limit
 * @returns The middleware function
 */
export function ipRateLimit(options: IpRateLimitOptions = {}) {
	const { trustProxy, ...rateLimitOptions } = options

	return async (
		req: MedusaRequest,
		res: MedusaResponse,
		next: MedusaNextFunction,
	) => {
		const cacheService = req.scope.resolve<ICacheService>(Modules.CACHE)

		const rateLimit = new RateLimit({
			cacheService,
			options: rateLimitOptions,
		})

		const ip = getClientIp(req, trustProxy)
		const { success, remaining, limit } = await rateLimit.limit(ip)

		res.setHeader("X-RateLimit-Limit", String(limit))
		res.setHeader("X-RateLimit-Remaining", String(remaining))

		if (!success) {
			res.status(429).send("Too many requests, please try again later.")
			return
		}

		next()
	}
}
