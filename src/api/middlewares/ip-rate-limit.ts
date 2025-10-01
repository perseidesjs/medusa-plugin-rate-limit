import type {
	MedusaNextFunction,
	MedusaRequest,
	MedusaResponse,
} from "@medusajs/framework/http"
import type { ICacheService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { type PluginOptions, RateLimit } from "../../core/rate-limit"
import { getIp } from "../../utils/get-ip"

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

		const ip = getIp(req)
		const { success, remaining, limit } = await rateLimit.limit(ip)

		if (!success) {
			res.setHeader("X-RateLimit-Limit", String(limit))
			res.setHeader("X-RateLimit-Remaining", String(remaining))
			res.status(429).send("Too many requests, please try again later.")
			return
		}

		res.setHeader("X-RateLimit-Limit", String(limit))
		res.setHeader("X-RateLimit-Remaining", String(remaining))

		next()
	}
}
