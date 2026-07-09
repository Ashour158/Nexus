// The executive dashboard lives in the route group's index page but the bare
// `/` route is redirected to `/dashboard` in middleware (rendering `/` hits a
// Next.js standalone-output bug). Re-export the existing dashboard here so it is
// reachable at a stable, non-redirected URL.
export { default } from '../page';
