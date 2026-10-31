/** The two Deno APIs the Edge Function entry files use (backend/supabase/functions/<name>/index.ts). Logic lives in _shared. */
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
