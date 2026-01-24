// IPv4: 4 decimal octets (0-255) separated by dots
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

// IPv6: 8 groups of 4 hex chars, with :: shorthand support
const IPV6_REGEX =
	/^(?:(?:[a-fA-F\d]{1,4}:){7}[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,7}:|(?:[a-fA-F\d]{1,4}:){1,6}:[a-fA-F\d]{1,4}|(?:[a-fA-F\d]{1,4}:){1,5}(?::[a-fA-F\d]{1,4}){1,2}|(?:[a-fA-F\d]{1,4}:){1,4}(?::[a-fA-F\d]{1,4}){1,3}|(?:[a-fA-F\d]{1,4}:){1,3}(?::[a-fA-F\d]{1,4}){1,4}|(?:[a-fA-F\d]{1,4}:){1,2}(?::[a-fA-F\d]{1,4}){1,5}|[a-fA-F\d]{1,4}:(?::[a-fA-F\d]{1,4}){1,6}|:(?:(?::[a-fA-F\d]{1,4}){1,7}|:)|::(?:[fF]{4}:)?(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|(?:[a-fA-F\d]{1,4}:){1,4}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))$/

/**
 * Check for control chars, null bytes, newlines (0x00-0x1f, 0x7f)
 */
function hasDangerousChars(str: string): boolean {
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i)
		if (code <= 0x1f || code === 0x7f) return true
	}
	return false
}

/**
 * Validates if a string is a valid IPv4 or IPv6 address
 */
export function isValidIp(ip: string): boolean {
	if (!ip || typeof ip !== "string") return false
	if (hasDangerousChars(ip)) return false
	if (ip.length > 45) return false // Max IPv6 length

	return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip)
}

/**
 * Normalizes an IPv6 address to lowercase for consistent rate limiting
 */
export function normalizeIp(ip: string): string {
	if (!isValidIp(ip)) return ip
	// IPv6 normalization: lowercase
	if (ip.includes(":")) {
		return ip.toLowerCase()
	}
	return ip
}

/**
 * Sanitizes an IP, returning fallback if invalid
 */
export function sanitizeIp(ip: string, fallback: string): string {
	if (isValidIp(ip)) return normalizeIp(ip)
	return fallback
}
