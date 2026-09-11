# Gossip Girl

Public posts, publisher-only username/password login, photo feed, party feed, and links collected from posts. Cloudflare Workers serves the website and API; Supabase stores posts and revocable login sessions. The publisher password and Supabase secret key never go to the browser or GitHub.

## Supabase

Run `schema.sql` in your project's SQL Editor. It creates three prefixed tables with row-level security enabled and blocks direct anonymous access. Only the Cloudflare server's secret key can use them. Copy the project URL and obtain a server secret key in Supabase's project settings.

## Cloudflare

Connect this GitHub repository in Cloudflare Workers & Pages, creating a **Worker** with Git integration. Use `npm install` to install dependencies, `npm run check && npm test` as the build command, and `npm run deploy` as the deploy command. There is no framework build or output directory; Wrangler publishes `public/` and `worker.mjs` together.

Set these runtime secrets before testing login and posts:

- `SUPABASE_URL`: your project's HTTPS URL.
- `SUPABASE_SECRET_KEY`: the Supabase secret key (`sb_secret_...`) or legacy service-role key. Never use a publishable key here.
- `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH`: the private values prepared locally for your chosen publisher password. They are intentionally excluded from GitHub.

`ADMIN_USERNAME` is already `gossipgirlxoxo` in Wrangler configuration. Deploy and open the Worker HTTPS address. Test reading while logged out, then log in and publish a blast. Choose Parties to add it to the party feed. Add a photo link for it to appear in Pics. HTTPS links included in text appear under Links.

For local development, copy `.dev.vars.example` to `.dev.vars`, fill in the secrets privately, then run `npm install` and `npm run dev`. This uses your configured Supabase database. The previous SQLite preview is separate and its posts need to be imported if you want to keep them online.

Sessions expire after eight hours and logout revokes them immediately. To invalidate all sessions during a credential change, delete the contents of `gg_sessions` through the Supabase dashboard. The server limits login attempts to ten per IP address in fifteen minutes. Expired sessions and attempt records are cleaned up during login attempts.

## Validation

`npm run check` checks JavaScript syntax. `npm test` checks the Worker against a simulated Supabase API. Live database permissions and the deployed site must also be checked after account setup.

References: [Cloudflare asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/), [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
