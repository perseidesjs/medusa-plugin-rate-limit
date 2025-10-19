import type {
	MedusaNextFunction,
	MedusaRequest,
	MedusaResponse,
} from "@medusajs/framework/http"
import type { ICacheService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { type PluginOptions, RateLimit } from "../../core/rate-limit"

/**
 * Default rate limit middleware that uses the IP address as the identifier
 * @param options - The options for the rate limit
 * @returns The middleware function
 */
export function ipRateLimit(options: Partial<PluginOptions> = {}) {
	return async (
		req: MedusaRequest,
		res: MedusaResponse,
		next: MedusaNextFunction,
	) => {
		const cacheService = req.scope.resolve<ICacheService>(Modules.CACHE)

		const rateLimit = new RateLimit({
			cacheService,
			options,
		})

		const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string
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
