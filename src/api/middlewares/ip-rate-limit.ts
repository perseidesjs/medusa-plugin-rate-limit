import type {
	MedusaNextFunction,
	MedusaRequest,
	MedusaResponse,
} from "@medusajs/framework/http"
import type { ICacheService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { type PluginOptions, RateLimit } from "../../core/rate-limit"
import { isValidIp, normalizeIp } from "../../utils/ip-validator"

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

const FALLBACK_IP = "unknown"

/**
 * Extracts the client IP address from the request
 * @param req - The request object
 * @param trustProxy - Whether to trust the X-Forwarded-For header
 * @returns The client IP address
 */
function getClientIp(req: MedusaRequest, trustProxy: boolean | number = false): string {
	const rawDirectIp = req.socket.remoteAddress || FALLBACK_IP
	const directIp = isValidIp(rawDirectIp) ? normalizeIp(rawDirectIp) : FALLBACK_IP

	if (!trustProxy) {
		return directIp
	}

	const forwardedFor = req.headers["x-forwarded-for"]
	if (!forwardedFor) {
		return directIp
	}

	const rawIps = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
		.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean)

	// Filter to only valid IPs
	const forwardedIps = rawIps.filter(isValidIp).map(normalizeIp)

	if (forwardedIps.length === 0) {
		return directIp
	}

	if (trustProxy === true) {
		// Trust the leftmost valid IP
		return forwardedIps[0]
	}

	// trustProxy is a number: count from the right
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

		try {
			const { success, remaining, limit, resetAt } = await rateLimit.limit(ip)

			res.setHeader("X-RateLimit-Limit", String(limit))
			res.setHeader("X-RateLimit-Remaining", String(remaining))
			res.setHeader("X-RateLimit-Reset", String(resetAt))

			if (!success) {
				const retryAfter = Math.max(1, resetAt - Math.floor(Date.now() / 1000))
				res.setHeader("Retry-After", String(retryAfter))
				res.status(429).send("Too many requests, please try again later.")
				return
			}

			next()
		} catch (error) {
			// Fail-open: allow request on unexpected errors, log for visibility
			console.error("[rate-limit] Error checking rate limit:", error)
			next()
		}
	}
}
