import type { MedusaRequest } from "@medusajs/framework/http"

export function getIp(req: MedusaRequest): string {
	let ip: string | undefined

	if ("_remoteAddress" in req && typeof req._remoteAddress === "string") {
		ip = req._remoteAddress
	} else if (
		"socket" in req &&
		typeof req.socket === "object" &&
		req.socket !== null &&
		"remoteAddress" in req.socket &&
		typeof req.socket.remoteAddress === "string"
	) {
		ip = req.socket.remoteAddress
	} else if (
		"request_context" in req &&
		typeof req.request_context === "object" &&
		req.request_context !== null &&
		"ip_address" in req.request_context &&
		typeof req.request_context.ip_address === "string"
	) {
		ip = req.request_context.ip_address
	} else if (
		"headers" in req &&
		typeof req.headers === "object" &&
		req.headers !== null &&
		"x-forwarded-for" in req.headers &&
		typeof req.headers["x-forwarded-for"] === "string"
	) {
		ip = req.headers["x-forwarded-for"] as string
	} else {
		ip = "unknown"
	}

	return ip
}
