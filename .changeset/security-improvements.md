---
"@perseidesjs/medusa-plugin-rate-limit": minor
---

Security & algorithm improvements:
- Switch to sliding window timestamps (more accurate rate limiting)
- Add IP validation/sanitization to prevent header injection
- Add `failOpen` option (default: true) for cache failures
- Add `Retry-After` and `X-RateLimit-Reset` headers
- Export `isValidIp`, `normalizeIp`, `sanitizeIp` utilities
- Upgrade to Medusa 2.13.0 compatibility
