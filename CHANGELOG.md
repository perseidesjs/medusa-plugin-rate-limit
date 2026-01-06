# @perseidesjs/medusa-plugin-rate-limit

## 3.1.0

### Minor Changes

- dfc39e3: Fixed the default ip-rate-limit middleware and do not use the x-forwarded-for header for the direct connection ip address instead

## 3.0.0

### Major Changes

- 5e0ee7a: V3 - Revamped the whole way we rate limit apps. Introducing the `RateLimit` class for more granular control.

  **Breaking Changes:**
  - The `defaultRateLimit` middleware has been removed
  - Global configuration has been removed

  **New Features:**
  - Introduction of the `RateLimit` class for programmatic rate limiting
  - Built-in `ipRateLimit` middleware for common IP-based rate limiting
  - Support for custom identifiers beyond IP addresses
  - More granular control over rate limiting logic

  ## The RateLimit Class

  The core of V3 is the new `RateLimit` class that gives you programmatic control over rate limiting. This class integrates directly with Medusa's cache service and allows you to implement custom rate limiting logic.

  ### Basic Usage

  ```ts title="src/api/middlewares.ts"
  import { defineMiddlewares } from "@medusajs/medusa";
  import { RateLimit } from "@perseidesjs/medusa-plugin-rate-limit";
  import { Modules } from "@medusajs/framework/utils";

  export default defineMiddlewares({
    routes: [
      {
        matcher: "/store/custom*",
        middlewares: [
          async (
            req: MedusaRequest,
            res: MedusaResponse,
            next: MedusaNextFunction,
          ) => {
            const cacheService = req.scope.resolve(Modules.CACHE);
            const rateLimit = new RateLimit({
              cacheService,
              options: {
                limit: 50, // 50 requests per minute
                window: 60,
              },
            });

            const ip = req.headers["x-forwarded-for"] as string;
            const { success } = await rateLimit.limit(ip);
            if (!success) {
              res
                .status(429)
                .send("Too many requests, please try again later.");
              return;
            }
            next();
          },
        ],
      },
    ],
  });
  ```

## 2.2.0

### Minor Changes

- ceb1e9b: Increased defaults values to `limit` and `window`

## 2.1.1

### Patch Changes

- 0aaa241: Fixed README.md on NPM

## 2.1.0

### Minor Changes

- 0f909a4: Upgraded dependencies

## 2.0.3

### Patch Changes

- ca6b93a: - Upgraded devDependencies and Medusa peer dependency
