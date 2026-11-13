# Short share links

A Cloudflare Worker with one KV namespace. It turns

```
https://sdaveas.github.io/workout-companion/?v=4#/add/1H4sIA…   (308 chars)
```

into

```
https://wc-links.<you>.workers.dev/aB3xK9p                    (34 chars)
```

and `GET /aB3xK9p` answers `302` with the long link in `Location`. Nothing else in the
app depends on it: if the worker is missing or offline, the app shares the long link.

## Deploy (once, ~5 minutes)

```sh
cd worker
npx wrangler login
npx wrangler kv namespace create LINKS     # copy the id it prints into wrangler.toml
npx wrangler deploy                        # prints the https://…workers.dev origin
```

Then put that origin in `src/lib/shorten.ts` (`SHORTENER`) and rebuild:

```sh
BASE=/workout-companion/ npx vite build
```

## Cost and limits

Free plan: 100k reads and 1k writes per day. A share is one write; an open is one read.

## What it changes about the app

- Every shared workout now lives in this KV namespace for five years, not only in the
  chat. Delete the worker and every short link already sent stops working — the long
  link it replaced is still in the message if the sender kept it.
- The worker only accepts links to this deployment, so it is not an open redirector.
- The chat preview card still comes from the page's own meta tags: crawlers that follow
  redirects (WhatsApp does) show it, those that do not show the worker's bare page.
