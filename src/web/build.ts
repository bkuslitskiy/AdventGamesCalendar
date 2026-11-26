/**
 * Which deploy this page's code came from. `npm run build` (tools/content.mjs) overwrites the compiled
 * public/js/web/build.js with the same stamp it puts in the server bundle, so /api/state can tell an
 * open tab that a newer deploy is live. Left as 'dev' (no update checks) when only `tsc` has run.
 */
export const BUILD: string = 'dev';
