export type PluginOptions = {
	limit: number
	window: number
	includeHeaders: boolean
}

export const DEFAULT_OPTIONS: PluginOptions = {
	limit: 100, // Maximum number of requests allowed in the time window
	window: 60 * 15, // 15 minutes (in seconds) - Time window for rate limiting
	includeHeaders: true,
}
