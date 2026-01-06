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
import { ipRateLimit, type IpRateLimitOptions } from "../api/middlewares/ip-rate-limit"

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

	describe("trustProxy option", () => {
		it("should ignore X-Forwarded-For header by default (trustProxy=false)", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60 })

			// First request without header
			await request(app).get("/")
			const firstCallKey = mockCacheService.get.mock.calls[0][0]

			mockCacheService.get.mockClear()

			// Second request with spoofed X-Forwarded-For - should use same key (socket IP)
			await request(app).get("/").set("X-Forwarded-For", "1.2.3.4")
			const secondCallKey = mockCacheService.get.mock.calls[0][0]

			expect(firstCallKey).toBe(secondCallKey)
		})

		it("should use X-Forwarded-For when trustProxy=true", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "203.0.113.50")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should use leftmost IP from X-Forwarded-For when trustProxy=true", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			await request(app).get("/").set("X-Forwarded-For", "203.0.113.50, 198.51.100.1, 192.0.2.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("203.0.113.50"),
			)
		})

		it("should extract correct IP when trustProxy is a number (single proxy)", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60, trustProxy: 1 })

			// trustProxy=1 means we have 1 trusted proxy
			// Header: "spoofed_by_attacker, real_client_ip_seen_by_proxy"
			// We use the rightmost IP (what our trusted proxy actually saw)
			// This prevents attackers from prepending fake IPs to bypass rate limiting
			await request(app).get("/").set("X-Forwarded-For", "203.0.113.50, 198.51.100.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("198.51.100.1"),
			)
		})

		it("should extract correct IP when trustProxy is a number (multiple proxies)", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60, trustProxy: 2 })

			// trustProxy=2 means we have 2 trusted proxies in chain
			// Header: "spoofed, client_seen_by_proxy1, proxy1_seen_by_proxy2"
			// index = max(0, 3-2) = 1, so we get the 2nd entry (what proxy1 saw)
			await request(app).get("/").set("X-Forwarded-For", "203.0.113.50, 198.51.100.1, 192.0.2.1")

			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("198.51.100.1"),
			)
		})

		it("should fall back to socket IP when X-Forwarded-For is missing and trustProxy is enabled", async () => {
			mockCacheService.get.mockResolvedValue(0)
			const app = createTestApp({ limit: 10, window: 60, trustProxy: true })

			// Request without X-Forwarded-For header
			await request(app).get("/")

			// Should use socket remoteAddress (127.0.0.1 in tests)
			expect(mockCacheService.get).toHaveBeenCalledWith(
				expect.stringContaining("127.0.0.1"),
			)
		})

		it("should prevent rate limit bypass via header spoofing when trustProxy=false", async () => {
			const app = createTestApp({ limit: 2, window: 60, trustProxy: false })

			// Simulate attacker making requests with different spoofed IPs
			mockCacheService.get
				.mockResolvedValueOnce(0)
				.mockResolvedValueOnce(1)
				.mockResolvedValueOnce(2)

			const response1 = await request(app).get("/").set("X-Forwarded-For", "fake-ip-1")
			expect(response1.status).toBe(200)

			const response2 = await request(app).get("/").set("X-Forwarded-For", "fake-ip-2")
			expect(response2.status).toBe(200)

			// Third request should be blocked because we're using the real socket IP
			const response3 = await request(app).get("/").set("X-Forwarded-For", "fake-ip-3")
			expect(response3.status).toBe(429)
		})
	})
})
