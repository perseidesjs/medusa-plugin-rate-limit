<p align="center">
  <a href="https://www.github.com/perseidesjs">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.r/dark.png" width="128" height="128">
    <source media="(prefers-color-scheme: light)" srcset="./.r/light.png" width="128" height="128">
    <img alt="Perseides logo" src="./.r/light.png">
    </picture>
  </a>
</p>
<h1 align="center">
  @perseidesjs/medusa-plugin-rate-limit
</h1>

<p align="center">
  <img src="https://img.shields.io/npm/v/@perseidesjs/medusa-plugin-rate-limit" alt="npm version">
  <img src="https://img.shields.io/github/license/perseidesjs/medusa-plugin-rate-limit" alt="GitHub license">
</p>

<h4 align="center">
  <a href="https://perseides.org">Website</a> |
  <a href="https://www.medusajs.com">Medusa</a>
</h4>

<p align="center">
  A simple rate-limit plugin for Medusa.
</p>

<h2>
  Installation
</h2>

```bash
npm install @perseidesjs/medusa-plugin-rate-limit
```

<h2>
  Usage
</h2>
<p>
This plugin uses Redis under the hood, this plugin will also work in a development environment thanks to the fake Redis instance created by Medusa, remember to use Redis in production, by just passing the <code>redis_url</code> option to the <code>medusa-config.js > projectConfig</code> object.
</p>

<h3>
  Plugin configuration
</h3>

<p>
You need to add the plugin to your Medusa configuration before you can use the rate limitting service. To do this, import the plugin as follows: 
</p>

```ts
const plugins = [
	`medusa-fulfillment-manual`,
	`medusa-payment-manual`,
	`@perseidesjs/medusa-plugin-rate-limit`,
]
```

<p>You can also override the default configuration by passing an object to the plugin as follows: </p>

```ts
const plugins = [
	`medusa-fulfillment-manual`,
	`medusa-payment-manual`,
	{
		resolve: `@perseidesjs/medusa-plugin-rate-limit`,
		/** @type {import('@perseidesjs/medusa-plugin-rate-limit').PluginOptions} */
		options: {
			limit: 5,
			window: 60,
		},
	},
]
```

<h3> Default configuration </h3>

<table>
  <thead>
    <tr>
      <th>Option</th>
      <th>Type</th>
      <th>Default</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>limit</td>
      <td><code>Number</code></td>
      <td><code>5</code></td>
      <td>The number of requests allowed in the given time window</td>
    </tr>
    <tr>
      <td>window</td>
      <td><code>Number</code></td>
      <td><code>60</code></td>
      <td>The time window in seconds</td>   
    </tr>
  </tbody>
</table>

<h2>
  How to use
</h2>

<p>
    If you want to start restricting certain routes, you can resolve the <code>RateLimitService</code> from the Medusa container, and then create middleware as shown below :
</p>

```ts
// src/middlewares/rate-limit.ts

import { type MedusaRequest, type MedusaResponse } from '@medusajs/medusa'
import type { NextFunction } from 'express'
import type { RateLimitService } from '@perseidesjs/medusa-plugin-rate-limit'

/**
 * A simple rate limiter middleware based on the RateLimitService
 * @param limit {number} - Number of requests allowed per window
 * @param window  {number} - Number of seconds to wait before allowing requests again
 * @returns
 */
export default async function rateLimit(
	req: MedusaRequest,
	res: MedusaResponse,
	next: NextFunction,
) {
	try {
    // 1️⃣ We resolve the RateLimitService from the container
		const rateLimitService = req.scope.resolve<RateLimitService>('rateLimitService')


    // 2️⃣ We create a key for the current request based on the IP address for example
		const key = req.ip 
		const rateLimitKey = `rate_limit:${key}`
		const allowed = await rateLimitService.limit(rateLimitKey)

    // 3️⃣ If the request is not allowed, we return a 429 status code and a JSON response with an error message
		if (!allowed) {
			const retryAfter = await rateLimitService.ttl(rateLimitKey)
			res.set('Retry-After', String(retryAfter))
			res
				.status(429)
				.json({ error: 'Too many requests, please try again later.' })
			return
		}

    // 4️⃣ Otherwise, we can continue, below I'm getting the remaining attempts for the current key for example
		const remaining = await rateLimitService.getRemainingAttempts(rateLimitKey)

		res.set('X-RateLimit-Limit', String(rateLimitService.getOptions().limit))
		res.set('X-RateLimit-Remaining', String(remaining))

		next()
	} catch (error) {
		next(error)
	}
}
```

<p>And then use it in your <code>src/api/middlewares.ts</code> file as follows:</p>

```ts
import { MiddlewaresConfig } from '@medusajs/medusa'
import rateLimit from './middlewares/rate-limit'

export const config: MiddlewaresConfig = {
	routes: [
		{
			// This will limit the number of requests to 5 per 60 seconds on the auth route
			matcher: '/store/auth',
			middlewares: [rateLimit],
		},
	],
}
```

<h2> More information </h2>
<p> You can find the <code>RateLimitService</code> class in the <a href="https://github.com/perseidesjs/medusa-plugin-rate-limit/blob/main/src/services/rate-limit.ts">src/services/rate-limit.ts</a> file.</p>

<h2>License</h2>
<p> This project is licensed under the MIT License - see the <a href="./LICENSE.md">LICENSE</a> file for details</p>
