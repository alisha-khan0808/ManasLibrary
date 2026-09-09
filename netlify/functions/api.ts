import serverless from 'serverless-http';
import { createApp } from '@manas/api/dist/app.js';

/**
 * The Manas Library API, served as a single Netlify Function.
 *
 * The Express app is reused verbatim — every route, guard and validator is
 * the same code the tests cover and the local server runs. Only the
 * transport changes: instead of `app.listen()`, requests arrive through this
 * handler via the `/api/*` redirect declared in netlify.toml.
 *
 * Consequences of running serverless, all deliberate:
 *
 *   - The background scheduler is NOT started. `index.ts` owns that, and a
 *     function has no persistent process to run cron in. Fee reminders and
 *     membership expiry therefore do not run here — they need a Netlify
 *     Scheduled Function or an external trigger. See docs/DEPLOYMENT.md.
 *
 *   - Each concurrent instance opens its own connection pool, so
 *     DATABASE_POOL_MAX must stay small and DATABASE_URL should point at
 *     Supabase's transaction pooler (port 6543), which exists for this.
 *
 * The app is built once per container and reused across invocations, so a
 * warm instance pays neither the construction nor the connection cost again.
 */
const app = createApp();

const serverlessHandler = serverless(app, {
  /**
   * Normalises the incoming path.
   *
   * Depending on how Netlify matches the route, a function can be invoked
   * with either the original request path (`/api/v1/branches`) or its own
   * function path (`/.netlify/functions/api/v1/branches`). The Express
   * router only knows the former, so both are folded into it rather than
   * relying on which one Netlify happens to send.
   */
  request(request: { url?: string }) {
    if (!request.url) return;

    const [rawPath = '/', query] = request.url.split('?');
    let pathname = rawPath.replace(/^\/\.netlify\/functions\/api/, '') || '/';

    if (pathname !== '/health' && !pathname.startsWith('/api/')) {
      pathname = `/api${pathname.startsWith('/') ? '' : '/'}${pathname}`;
    }

    request.url = query ? `${pathname}?${query}` : pathname;
  },
});

export async function handler(event: unknown, context: unknown) {
  // Without this a warm container is held open by the idle pg pool until it
  // times out, which shows up as slow responses rather than an error.
  (context as { callbackWaitsForEmptyEventLoop?: boolean }).callbackWaitsForEmptyEventLoop =
    false;

  return serverlessHandler(event as never, context as never);
}
