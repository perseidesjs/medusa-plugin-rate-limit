import type {
	MedusaNextFunction,
	MedusaRequest,
	MedusaResponse,
} from "@medusajs/framework"
import type { ICacheService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import express from "express"
import request from "supertest"
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { ipRateLimit } from "../api/middlewares/ip-rate-limit"
import type { PluginOptions } from "../core/rate-limit"

const createMockCacheService = () => {
	const mock = {
		get: vi.fn(),
		set: vi.fn(),
		invalidate: vi.fn(),
	}

	return mock as unknown as ICacheService & {
		get: Mock
		set: Mock
		invalidate: Mock
	}
}

let mockCacheService: ReturnType<typeof createMockCacheService>

const mockScope = {
	resolve: vi.fn().mockImplementation((module) => {
		if (module === Modules.CACHE) {
			return mockCacheService
		}
		return {}
	}),
}

const createTestApp = (options?: PluginOptions) => {
	const app = express()
	app.use((req: MedusaRequest, _: MedusaResponse, next: MedusaNextFunction) => {
		req.scope = mockScope as unknown as MedusaContainer
		next()
	})

	app.use(ipRateLimit(options))

	app.get("/", (_, res) => {
		res.send("Hello World")
	})

	return app
}

describe("ipRateLimit Middleware", () => {
	beforeEach(() => {
		mockCacheService = createMockCacheService()
		vi.clearAllMocks()
	})

	it("should allow requests under the limit", async () => {
		mockCacheService.get.mockResolvedValue(0)
		const app = createTestApp({ limit: 2, window: 60 })

		const response = await request(app).get("/")
		expect(response.status).toBe(200)
		expect(response.text).toBe("Hello World")
	})

	it("should block requests over the limit", async () => {
		mockCacheService.get.mockResolvedValue(2)
		const app = createTestApp({ limit: 2, window: 60 })

		const response = await request(app).get("/")
		expect(response.status).toBe(429)
		expect(response.text).toBe("Too many requests, please try again later.")
	})

	it("should include rate limit headers", async () => {
		mockCacheService.get.mockResolvedValue(0)
		const app = createTestApp({ limit: 2, window: 60 })

		const response = await request(app).get("/")
		expect(response.headers["x-ratelimit-limit"]).toBe("2")
		expect(response.headers["x-ratelimit-remaining"]).toBe("1")
	})

	it("should handle multiple requests correctly", async () => {
		mockCacheService.get
			.mockResolvedValueOnce(0)
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2)
			.mockResolvedValueOnce(3)

		const app = createTestApp({ limit: 3, window: 60 })

		const response1 = await request(app).get("/")
		expect(response1.status).toBe(200)
		expect(response1.headers["x-ratelimit-remaining"]).toBe("2")

		const response2 = await request(app).get("/")
		expect(response2.status).toBe(200)
		expect(response2.headers["x-ratelimit-remaining"]).toBe("1")

		const response3 = await request(app).get("/")
		expect(response3.status).toBe(200)
		expect(response3.headers["x-ratelimit-remaining"]).toBe("0")

		const response4 = await request(app).get("/")
		expect(response4.status).toBe(429)
	})

	it("should use different prefixes for different configurations", async () => {
		mockCacheService.get.mockResolvedValue(0)

		const customOptions = { limit: 5, window: 30, prefix: "custom-rate-limit" }
		const app = createTestApp(customOptions)

		const response = await request(app).get("/")
		expect(response.status).toBe(200)
		expect(mockCacheService.get).toHaveBeenCalledWith(
			expect.stringContaining("custom-rate-limit"),
		)
	})

	it("should handle edge case where limit is 0 (no requests allowed)", async () => {
		mockCacheService.get.mockResolvedValue(0)
		const app = createTestApp({ limit: 0, window: 60 })

		const response = await request(app).get("/")
		expect(response.status).toBe(429)
		expect(response.text).toBe("Too many requests, please try again later.")
	})
})
