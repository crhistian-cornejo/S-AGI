import type { AnyRouter, AnyProcedure } from "@trpc/server";
import log from "electron-log";

/**
 * Creates a lazy-loaded router wrapper that defers the actual router import
 * until it's first accessed. This significantly reduces cold boot time by
 * avoiding eager imports of heavy dependencies (AI SDKs, tool definitions, etc.).
 *
 * Type Safety: The TypeScript type is imported separately via `import type`,
 * so type inference works perfectly while the runtime code loads lazily.
 *
 * How it works:
 * 1. Returns a Proxy that looks like a tRPC router
 * 2. On first property access, imports and caches the real router
 * 3. All subsequent calls use the cached router with zero overhead
 *
 * Compatible with trpc-electron's IPC handler and maintains full type safety.
 */
export function createLazyRouter<T extends AnyRouter>(
  routerName: string,
  importFn: () => Promise<{ [key: string]: any }>
): T {
  let cachedRouter: T | null = null;
  let loadingPromise: Promise<T> | null = null;

  // Load and cache the router (singleton pattern)
  const loadRouter = async (): Promise<T> => {
    if (cachedRouter) {
      return cachedRouter;
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      const startTime = Date.now();
      log.info(`[LazyRouter] Loading ${routerName}...`);

      try {
        const module = await importFn();

        // Find the router export (should end with "Router")
        const routerKey = Object.keys(module).find((key) =>
          key.toLowerCase().endsWith("router")
        );

        if (!routerKey) {
          throw new Error(
            `[LazyRouter] No router export found for ${routerName}. ` +
              `Available exports: ${Object.keys(module).join(", ")}`
          );
        }

        cachedRouter = module[routerKey];
        const loadTime = Date.now() - startTime;
        log.info(`[LazyRouter] Loaded ${routerName} in ${loadTime}ms`);

        return cachedRouter!;
      } catch (error) {
        log.error(`[LazyRouter] Failed to load ${routerName}:`, error);
        loadingPromise = null; // Reset so we can retry
        throw error;
      }
    })();

    return loadingPromise;
  };

  // Create a Proxy that intercepts all property access
  // This works because tRPC routers are just objects with _def and procedures
  return new Proxy({} as T, {
    get(_target, prop: string | symbol, receiver) {
      // Handle tRPC's internal _def property
      if (prop === "_def") {
        // If router is already loaded, return its _def
        if (cachedRouter) {
          return cachedRouter._def;
        }

        // Return a lazy _def that loads the router when accessed
        // This is needed for tRPC's router merging during initialization
        return new Proxy(
          {
            record: {},
            procedures: {},
            queries: {},
            mutations: {},
            subscriptions: {},
            _config: {},
          } as any,
          {
            get(_defTarget, defProp: string | symbol) {
              // If we're checking for procedures/record, return a proxy that lazy-loads
              if (defProp === "record" || defProp === "procedures") {
                return new Proxy(
                  {},
                  {
                    // When tRPC accesses a procedure, load the router first
                    get(_recordTarget, procName: string | symbol) {
                      // Return a lazy procedure wrapper
                      const lazyProcedure: AnyProcedure = (async (
                        opts: any
                      ) => {
                        const realRouter = await loadRouter();
                        const realRecord = (realRouter._def as any)[defProp];
                        const realProc = realRecord?.[procName as string];

                        if (!realProc) {
                          throw new Error(
                            `[LazyRouter] Procedure "${String(
                              procName
                            )}" not found in ${routerName}`
                          );
                        }

                        // Call the real procedure
                        return realProc(opts);
                      }) as any;

                      return lazyProcedure;
                    },

                    // Handle Object.keys() for procedure enumeration
                    ownKeys() {
                      if (cachedRouter) {
                        return Reflect.ownKeys(
                          (cachedRouter._def as any)[defProp]
                        );
                      }
                      return [];
                    },

                    has(_recordTarget, procName: string | symbol) {
                      if (cachedRouter) {
                        return procName in (cachedRouter._def as any)[defProp];
                      }
                      // Assume it exists to avoid premature loading
                      return true;
                    },
                  }
                );
              }

              // For other _def properties, load router if cached, otherwise return defaults
              if (cachedRouter) {
                return (cachedRouter._def as any)[defProp];
              }

              // Return safe defaults for tRPC internals
              if (defProp === "_config") return {};
              if (defProp === "router") return true;
              if (
                defProp === "queries" ||
                defProp === "mutations" ||
                defProp === "subscriptions"
              ) {
                return {};
              }

              return undefined;
            },
          }
        );
      }

      // Handle createCaller (used by tRPC to create procedure callers)
      if (prop === "createCaller") {
        return async (ctx: any) => {
          const realRouter = await loadRouter();
          return realRouter.createCaller(ctx);
        };
      }

      // For any other property access, load the router and delegate
      if (cachedRouter) {
        return Reflect.get(cachedRouter, prop, receiver);
      }

      // Return a function that loads the router when called
      return async (...args: any[]) => {
        const realRouter = await loadRouter();
        const value = (realRouter as any)[prop];

        if (typeof value === "function") {
          return value.apply(realRouter, args);
        }

        return value;
      };
    },

    // Handle property enumeration
    ownKeys(_target) {
      if (cachedRouter) {
        return Reflect.ownKeys(cachedRouter);
      }
      return ["_def", "createCaller"];
    },

    // Handle property descriptor queries
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (cachedRouter) {
        return Reflect.getOwnPropertyDescriptor(cachedRouter, prop);
      }

      if (prop === "_def" || prop === "createCaller") {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
        };
      }

      return undefined;
    },

    // Handle 'in' operator
    has(_target, prop: string | symbol) {
      if (cachedRouter) {
        return Reflect.has(cachedRouter, prop);
      }
      // Return true for tRPC essentials to avoid premature loading
      return prop === "_def" || prop === "createCaller";
    },
  });
}
