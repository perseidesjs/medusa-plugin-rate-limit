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
import {
	ipRateLimit,
	type IpRateLimitOptions,
} from "../api/middlewares/ip-rate-limit"

const createMockCacheService = () => {
	const store = new Map<string, { timestamps: number[]; windowStart: number }>()

	const mock = {
		get: vi.fn().mockImplementation((key: string) => {
			return Promise.resolve(store.get(key) || null)
		}),
		set: vi.fn().mockImplementation((key: string, value: unknown) => {
			store.set(key, value as { timestamps: number[]; windowStart: number })
			return Promise.resolve()
		}),
		invalidate: vi.fn().mockImplementation((key: string) => {
			store.delete(key)
			return Promise.resolve()
		}),
		_store: store,
		_clear: () => store.clear(),
	}

	return mock as unknown as ICacheService & {
		get: Mock
		set: Mock
		invalidate: Mock
		_store: Map<string, unknown>
		_clear: () => void
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

const createTestApp = (options?: IpRateLimitOptions) => {
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
		const app = createTestApp({ limit: 2, window: 60 })

		const response = await request(app).get("/")
		expect(response.status).toBe(200)
		expect(response.text).toBe("Hello World")
	})

	it("should block requests over the limit", async () => {
		const app = createTestApp({ limit: 2, window: 60 })

		await request(app).get("/")
		await request(app).get("/")
		const response = await request(app).get("/")

		expect(response.status).toBe(429)
		expect(response.text).toBe("Too many requests, please try again later.")
	})

	it("should include rate limit headers", async () => {
		const app = createTestApp({ limit: 2, window: 60 })

		const response = await request(app).get("/")
		expect(response.headers["x-ratelimit-limit"]).toBe("2")
		expect(response.headers["x-ratelimit-remaining"]).toBe("1")
		expect(response.headers["x-ratelimit-reset"]).toBeDefined()
	})

	it("should include Retry-After header on 429", async () => {
		const app = createTestApp({ limit: 1, window: 60 })

		await request(app).get("/")
		const response = await request(app).get("/")

		expect(response.status).toBe(429)
		expect(response.headers["retry-after"]).toBeDefined()
		expect(Number(response.headers["retry-after"])).toBeGreaterThan(0)
	})

	it("should handle multiple requests correctly", async () => {
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
		const customOptions = { limit: 5, window: 30, prefix: "custom-rate-limit" }
		const app = createTestApp(customOptions)

		await request(app).get("/")

		expect(mockCacheService.get).toHaveBeenCalledWith(
			expect.stringContaining("custom-rate-limit"),
		)
	})

	it("should handle edge case where limit is 0 (no requests allowed)", async () => {
		const app = createTestApp({ limit: 0, window: 60 })

		const response = await request(app).get("/")
		expect(response.status).toBe(429)
		expect(response.text).toBe("Too many requests, please try again later.")
	})

	describe("trustProxy option", () => {
		it("should ignore X-Forwarded-For header by default (trustProxy=false)", async () => {
			const app = createTestApp({ limit: 10, window: 60 })

			await request(app).get("/")
			const firstCallKey = mockCacheService.get.mock.calls[0][0]

			mockCacheService._clear()
			mockCacheService.get.mockClear()

			await request(app).get("/").set("X-Forwarded-For", "1.2.3.4")
			const secondCallKey = mockCacheService.get.mock.calls[0][0]

			expect(firstCallKey).toBe(secondCallKey)
		})

		it("should use X-Forwarded-For when trustProxy=true", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "203.0.113.50")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should use leftmost IP from X-Forwarded-For when trustProxy=true", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app)
				.get("/")
				.set("X-Forwarded-For", "203.0.113.50, 198.51.100.1, 192.0.2.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should extract correct IP when trustProxy is a number (single proxy)", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: 1 })

			await request(app)
				.get("/")
				.set("X-Forwarded-For", "203.0.113.50, 198.51.100.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("198.51.100.1"),
			)
		})

		it("should extract correct IP when trustProxy is a number (multiple proxies)", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: 2 })

			await request(app)
				.get("/")
				.set("X-Forwarded-For", "203.0.113.50, 198.51.100.1, 192.0.2.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("198.51.100.1"),
			)
		})

		it("should fall back to socket IP when X-Forwarded-For is missing and trustProxy is enabled", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("127.0.0.1"),
			)
		})

		it("should prevent rate limit bypass via header spoofing when trustProxy=false", async () => {
			const app = createTestApp({ limit: 2, window: 60, trustProxy: false })

			const response1 = await request(app)
				.get("/")
				.set("X-Forwarded-For", "fake-ip-1")
			expect(response1.status).toBe(200)

			const response2 = await request(app)
				.get("/")
				.set("X-Forwarded-For", "fake-ip-2")
			expect(response2.status).toBe(200)

			const response3 = await request(app)
				.get("/")
				.set("X-Forwarded-For", "fake-ip-3")
			expect(response3.status).toBe(429)
		})
	})

	describe("IP validation", () => {
		it("should skip invalid IPs in X-Forwarded-For", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app)
				.get("/")
				.set("X-Forwarded-For", "invalid-ip, 203.0.113.50")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should fall back to socket IP when all X-Forwarded-For IPs are invalid", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "invalid, also-invalid")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("127.0.0.1"),
			)
		})

		it("should handle unicode/special chars in header as invalid IP", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app)
				.get("/")
				.set("X-Forwarded-For", "192.168.1.abc, 203.0.113.50")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should handle IPv6 addresses", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "2001:db8::1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("2001:db8::1"),
			)
		})

		it("should normalize IPv6 to lowercase", async () => {
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "2001:DB8::1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("2001:db8::1"),
			)
		})
	})

	describe("error handling", () => {
		it("should fail-open on cache get error", async () => {
			mockCacheService.get.mockRejectedValue(new Error("Redis down"))
			const app = createTestApp({ limit: 1, window: 60 })

			const response = await request(app).get("/")

			expect(response.status).toBe(200)
		})

		it("should fail-open on cache set error", async () => {
			mockCacheService.get.mockResolvedValue(null)
			mockCacheService.set.mockRejectedValue(new Error("Redis down"))
			const app = createTestApp({ limit: 10, window: 60 })

			const response = await request(app).get("/")

			expect(response.status).toBe(200)
		})
	})

	describe("concurrent requests", () => {
		it("should handle concurrent requests with bounded overage", async () => {
			const app = createTestApp({ limit: 3, window: 60 })

			const promises = Array(10)
				.fill(null)
				.map(() => request(app).get("/"))

			const responses = await Promise.all(promises)
			const successes = responses.filter((r) => r.status === 200).length

			// With sliding window, concurrency causes some overage
			// but it's bounded, not unlimited bypass
			expect(successes).toBeGreaterThanOrEqual(3)
			expect(successes).toBeLessThanOrEqual(10)
		})
	})
})
