import { describe, expect, it } from "vitest"
import { isValidIp, normalizeIp, sanitizeIp } from "../utils/ip-validator"

describe("IP Validator", () => {
	describe("isValidIp", () => {
		describe("IPv4", () => {
			it("accepts valid IPv4 addresses", () => {
				expect(isValidIp("192.168.1.1")).toBe(true)
				expect(isValidIp("10.0.0.1")).toBe(true)
				expect(isValidIp("255.255.255.255")).toBe(true)
				expect(isValidIp("0.0.0.0")).toBe(true)
				expect(isValidIp("127.0.0.1")).toBe(true)
			})

			it("rejects invalid IPv4 addresses", () => {
				expect(isValidIp("256.1.1.1")).toBe(false)
				expect(isValidIp("192.168.1")).toBe(false)
				expect(isValidIp("192.168.1.1.1")).toBe(false)
				expect(isValidIp("192.168.1.")).toBe(false)
				expect(isValidIp(".192.168.1.1")).toBe(false)
				expect(isValidIp("192.168.1.a")).toBe(false)
			})
		})

		describe("IPv6", () => {
			it("accepts valid IPv6 addresses", () => {
				expect(isValidIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true)
				expect(isValidIp("2001:db8:85a3::8a2e:370:7334")).toBe(true)
				expect(isValidIp("::1")).toBe(true)
				expect(isValidIp("::")).toBe(true)
				expect(isValidIp("fe80::1")).toBe(true)
				expect(isValidIp("::ffff:192.168.1.1")).toBe(true)
			})

			it("rejects invalid IPv6 addresses", () => {
				expect(isValidIp("2001:db8:85a3::8a2e:370g:7334")).toBe(false)
				expect(isValidIp("2001:db8:85a3::8a2e:370:7334:extra:parts")).toBe(false)
			})
		})

		describe("dangerous inputs", () => {
			it("rejects null bytes", () => {
				expect(isValidIp("192.168.1.1\x00")).toBe(false)
				expect(isValidIp("\x00192.168.1.1")).toBe(false)
			})

			it("rejects newlines", () => {
				expect(isValidIp("192.168.1.1\n")).toBe(false)
				expect(isValidIp("192.168.1.1\r")).toBe(false)
				expect(isValidIp("192.168.1.1\r\n")).toBe(false)
			})

			it("rejects control characters", () => {
				expect(isValidIp("192.168.1.1\t")).toBe(false)
				expect(isValidIp("\b192.168.1.1")).toBe(false)
			})

			it("rejects empty/null/undefined", () => {
				expect(isValidIp("")).toBe(false)
				expect(isValidIp(null as unknown as string)).toBe(false)
				expect(isValidIp(undefined as unknown as string)).toBe(false)
			})

			it("rejects overly long strings", () => {
				expect(isValidIp("a".repeat(100))).toBe(false)
			})

			it("rejects non-IP strings", () => {
				expect(isValidIp("unknown")).toBe(false)
				expect(isValidIp("localhost")).toBe(false)
				expect(isValidIp("example.com")).toBe(false)
			})
		})
	})

	describe("normalizeIp", () => {
		it("normalizes IPv6 to lowercase", () => {
			expect(normalizeIp("2001:DB8:85A3::8A2E:370:7334")).toBe(
				"2001:db8:85a3::8a2e:370:7334",
			)
		})

		it("keeps IPv4 unchanged", () => {
			expect(normalizeIp("192.168.1.1")).toBe("192.168.1.1")
		})

		it("returns invalid IPs unchanged", () => {
			expect(normalizeIp("invalid")).toBe("invalid")
		})
	})

	describe("sanitizeIp", () => {
		it("returns normalized IP if valid", () => {
			expect(sanitizeIp("192.168.1.1", "fallback")).toBe("192.168.1.1")
			expect(sanitizeIp("2001:DB8::1", "fallback")).toBe("2001:db8::1")
		})

		it("returns fallback if invalid", () => {
			expect(sanitizeIp("invalid", "fallback")).toBe("fallback")
			expect(sanitizeIp("", "unknown")).toBe("unknown")
			expect(sanitizeIp("192.168.1.1\n", "unknown")).toBe("unknown")
		})
	})
})
