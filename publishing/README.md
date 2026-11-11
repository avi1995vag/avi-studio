# Private social publishing service

The studio remains on GitHub Pages. This Cloudflare Worker lets the authorized owner sign in to Buffer and send the studio's artwork and caption together to connected social channels. Buffer's post response supplies each channel's delivery status.

## One-time owner setup

1. Sign in to Cloudflare using `npm exec -- cf auth login` from this directory after running `npm ci` with a supported Node.js version. Enable the account's workers.dev subdomain in Workers & Pages. The service origin will be `https://avi-studio-publisher.<your-subdomain>.workers.dev`.
2. In [Buffer API settings](https://publish.buffer.com/settings/api), register a **confidential OAuth app**. Enter the exact redirect URI `https://avi-studio-publisher.<your-subdomain>.workers.dev/oauth/callback`. Connect your channels in [Buffer channel settings](https://publish.buffer.com/settings/channels).
3. Create the D1 database with `npm exec -- cf d1 create --name avi-studio-publisher`. Apply [schema.sql](schema.sql) in the D1 console. For a command-line setup, use `cf d1 raw <database-id> --batch @<file.json>` with a JSON array containing one `{"sql":"..."}` object per statement.
4. Set `AVI_PUBLISHER_ORIGIN` in your shell to the service origin. Put the following values in the ignored `.dev.vars` file for the deploy command, or manage them as Worker secrets in Cloudflare.

| Secret | Value |
| --- | --- |
| `BUFFER_CLIENT_ID` | Registered Buffer OAuth app client ID |
| `BUFFER_CLIENT_SECRET` | Registered Buffer OAuth app client secret |
| `BUFFER_OWNER_EMAIL` | Email address of the Buffer account allowed to publish |
| `SESSION_ENCRYPTION_KEY` | Base64-encoded 32 random bytes, generated with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` |

5. Deploy from this directory with `npm run deploy -- --secrets-file .dev.vars`. Check the endpoint with `curl -H "Origin: https://avi1995vag.github.io" https://avi-studio-publisher.<your-subdomain>.workers.dev/health`. It returns `{"ready":true}` when the configuration and database are ready.
6. The AvI Studio Pages workflow already points to the project's Worker. If deploying to another Worker, set the repository Actions **variable** `SOCIAL_PUBLISHER_URL` to that origin and run **Studio Pages**. The panel becomes available when the service passes its health check. The URL is public, while Buffer and session secrets stay in the Worker.

## Behavior

- The editor signs in through Buffer. The studio receives only its own session identifier. The Worker encrypts Buffer credentials and refreshes them server-side. Signing out revokes the studio session. To revoke the provider grant, remove the app from Buffer.
- The service can submit image posts to connected Facebook Pages, X profiles, eligible Instagram accounts, LinkedIn, Threads, Bluesky, and Mastodon. Buffer and each platform enforce their channel, caption, and media rules.
- Image URLs have random identifiers and expire after 24 hours. The hourly cleanup removes expired images and sessions. Receipts are retained for seven days. If a post needs manual approval or misses the media window, review it in Buffer.
- If a request times out during publishing, check the receipt and Buffer queue before submitting again. The service never automatically repeats an unconfirmed social write.

Run `npm test` for local service checks. They use a SQLite D1 adapter and a mocked Buffer API. Verify the live OAuth grant and channel list after setup, then use a designated test channel for the first real post.
