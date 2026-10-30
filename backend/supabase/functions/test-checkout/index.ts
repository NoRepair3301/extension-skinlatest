// Thin Deno entry: all logic is in ../_shared (tested with Vitest). Secrets come from the function environment only.
import { depsFromEnv } from "../_shared/deps.ts";
import { handleTestCheckout } from "../_shared/handlers.ts";

Deno.serve((req) => handleTestCheckout(req, depsFromEnv((n) => Deno.env.get(n), (u, i) => fetch(u, i))));
