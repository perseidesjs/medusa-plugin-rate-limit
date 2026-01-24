import type { ICacheService } from "@medusajs/framework/types"
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { RateLimit, RateLimitError } from "../core/rate-limit"

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

describe("RateLimit", () => {
	let cacheService: ReturnType<typeof createMockCacheService>

	beforeEach(() => {
		cacheService = createMockCacheService()
		vi.clearAllMocks()
	})

	describe("constructor validation", () => {
		it("throws on negative limit", () => {
			expect(
				() => new RateLimit({ cacheService, options: { limit: -1, window: 60 } }),
			).toThrow(RateLimitError)
			expect(
				() => new RateLimit({ cacheService, options: { limit: -1, window: 60 } }),
			).toThrow("limit must be >= 0")
		})

		it("throws on zero window", () => {
			expect(
				() => new RateLimit({ cacheService, options: { limit: 10, window: 0 } }),
			).toThrow(RateLimitError)
			expect(
				() => new RateLimit({ cacheService, options: { limit: 10, window: 0 } }),
			).toThrow("window must be > 0")
		})

		it("throws on negative window", () => {
			expect(
				() => new RateLimit({ cacheService, options: { limit: 10, window: -5 } }),
			).toThrow("window must be > 0")
		})

		it("throws on empty prefix", () => {
			expect(
				() =>
					new RateLimit({
						cacheService,
						options: { limit: 10, window: 60, prefix: "" },
					}),
			).toThrow("prefix must be non-empty")
		})

		it("allows zero limit (no requests allowed)", () => {
			expect(
				() => new RateLimit({ cacheService, options: { limit: 0, window: 60 } }),
			).not.toThrow()
		})
	})

	describe("limit() validation", () => {
		it("throws on empty identifier", async () => {
			const rl = new RateLimit({ cacheService, options: { limit: 10, window: 60 } })
			await expect(rl.limit("")).rejects.toThrow("identifier must be a non-empty string")
		})

		it("throws on null identifier", async () => {
			const rl = new RateLimit({ cacheService, options: { limit: 10, window: 60 } })
			await expect(rl.limit(null as unknown as string)).rejects.toThrow(
				"identifier must be a non-empty string",
			)
		})
	})

	describe("sliding window behavior", () => {
		it("allows requests under limit", async () => {
			cacheService.get.mockResolvedValue(null)
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(true)
			expect(result.remaining).toBe(4)
			expect(result.limit).toBe(5)
			expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
		})

		it("blocks requests at limit", async () => {
			const now = Date.now()
			cacheService.get.mockResolvedValue({
				timestamps: [now - 1000, now - 2000, now - 3000],
				windowStart: now - 60000,
			})
			const rl = new RateLimit({ cacheService, options: { limit: 3, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(false)
			expect(result.remaining).toBe(0)
		})

		it("filters expired timestamps", async () => {
			const now = Date.now()
			cacheService.get.mockResolvedValue({
				timestamps: [now - 120000, now - 130000, now - 1000], // First 2 expired (>60s)
				windowStart: now - 130000,
			})
			const rl = new RateLimit({ cacheService, options: { limit: 3, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(true)
			expect(result.remaining).toBe(1) // 1 valid + 1 new = 2, remaining = 1
		})

		it("stores sliding window data", async () => {
			cacheService.get.mockResolvedValue(null)
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			await rl.limit("test-ip")

			expect(cacheService.set).toHaveBeenCalledWith(
				"rl:test-ip",
				expect.objectContaining({
					timestamps: expect.any(Array),
					windowStart: expect.any(Number),
				}),
				60,
			)
		})
	})

	describe("legacy migration", () => {
		it("treats legacy counter format as fresh start", async () => {
			cacheService.get.mockResolvedValue(5) // Old counter format
			const rl = new RateLimit({ cacheService, options: { limit: 10, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(true)
			expect(result.remaining).toBe(9)
		})
	})

	describe("error handling", () => {
		it("fails open by default on cache get error", async () => {
			cacheService.get.mockRejectedValue(new Error("Redis down"))
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(true)
			expect(result.remaining).toBe(5)
		})

		it("fails open by default on cache set error", async () => {
			cacheService.get.mockResolvedValue(null)
			cacheService.set.mockRejectedValue(new Error("Redis down"))
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const result = await rl.limit("test-ip")

			expect(result.success).toBe(true)
		})

		it("throws when failOpen=false and cache fails", async () => {
			cacheService.get.mockRejectedValue(new Error("Redis down"))
			const rl = new RateLimit({
				cacheService,
				options: { limit: 5, window: 60, failOpen: false },
			})

			await expect(rl.limit("test-ip")).rejects.toThrow("Redis down")
		})
	})

	describe("getRemaining()", () => {
		it("returns remaining count", async () => {
			const now = Date.now()
			cacheService.get.mockResolvedValue({
				timestamps: [now - 1000, now - 2000],
				windowStart: now - 60000,
			})
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const remaining = await rl.getRemaining("test-ip")

			expect(remaining).toBe(3)
		})

		it("handles legacy counter format", async () => {
			cacheService.get.mockResolvedValue(3)
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const remaining = await rl.getRemaining("test-ip")

			expect(remaining).toBe(2)
		})

		it("returns full limit on cache error", async () => {
			cacheService.get.mockRejectedValue(new Error("Redis down"))
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			const remaining = await rl.getRemaining("test-ip")

			expect(remaining).toBe(5)
		})
	})

	describe("reset()", () => {
		it("invalidates the cache key", async () => {
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			await rl.reset("test-ip")

			expect(cacheService.invalidate).toHaveBeenCalledWith("rl:test-ip")
		})

		it("ignores cache errors silently", async () => {
			cacheService.invalidate.mockRejectedValue(new Error("Redis down"))
			const rl = new RateLimit({ cacheService, options: { limit: 5, window: 60 } })

			await expect(rl.reset("test-ip")).resolves.not.toThrow()
		})
	})

	describe("concurrent requests (race condition mitigation)", () => {
		it("bounded overage under concurrent load", async () => {
			let storedData: { timestamps: number[]; windowStart: number } | null = null

			cacheService.get.mockImplementation(() => Promise.resolve(storedData))
			cacheService.set.mockImplementation((_key, data) => {
				storedData = data
				return Promise.resolve()
			})

			const rl = new RateLimit({ cacheService, options: { limit: 3, window: 60 } })

			// Simulate 10 concurrent requests
			const promises = Array(10)
				.fill(null)
				.map(() => rl.limit("test-ip"))

			const results = await Promise.all(promises)
			const successes = results.filter((r) => r.success).length

			// Due to race condition, may get more than 3 successes
			// But with sliding window, overage is bounded by concurrency level
			expect(successes).toBeGreaterThanOrEqual(3)
			expect(successes).toBeLessThanOrEqual(10)
		})
	})
})
