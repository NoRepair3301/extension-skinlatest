// Thin Deno entry: all logic is in ../_shared (tested with Vitest). Secrets come from the function environment only.
import { depsFromEnv, loadSigner } from "../_shared/deps.ts";
import { handleGetEntitlement } from "../_shared/handlers.ts";

Deno.serve(async (req) => handleGetEntitlement(req, { ...depsFromEnv((n) => Deno.env.get(n), (u, i) => fetch(u, i)), signer: await loadSigner((n) => Deno.env.get(n)) }));
