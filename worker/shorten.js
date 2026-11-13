/**
 * A share-link shortener: POST a link, get `/<id>` back; GET `/<id>` redirects to it.
 *
 * The link carries the workout in its fragment (`#/add/<payload>`), so the store holds
 * the whole URL string, fragment included. A redirect's Location may carry a fragment
 * and every browser honours it.
 *
 * Deploy: see README.md. Nothing else in the app depends on this worker — when it is
 * unreachable the app shares the long link.
 */

const ALLOWED_ORIGIN = 'https://sdaveas.github.io';

const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

/** No 0/o/1/l: a link gets read aloud and retyped. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const ID_LENGTH = 7;

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const target = body?.u;
      // Only our own links, so the worker cannot be used as an open redirector.
      if (
        typeof target !== 'string' ||
        target.length > 4000 ||
        !target.startsWith('https://sdaveas.github.io/workout-companion/')
      ) {
        return json({ error: 'not a workout link' }, 400);
      }
      const id = newId();
      await env.LINKS.put(id, target, { expirationTtl: 60 * 60 * 24 * 365 * 5 });
      return json({ s: `${url.origin}/${id}` });
    }

    const id = url.pathname.slice(1);
    if (!id) return new Response('Workout Companion link service', { status: 200 });

    const target = await env.LINKS.get(id);
    if (!target) return new Response('That link has expired or never existed.', { status: 404 });

    return new Response(null, { status: 302, headers: { location: target } });
  },
};
