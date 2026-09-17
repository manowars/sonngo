// GET /.netlify/functions/meta?url=https://example.com
// Returns { title, description, image, siteName } for a page. The browser
// cannot fetch arbitrary pages itself (CORS), so this small proxy does it.

const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function pickMeta(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, 'i'
    );
    const tag = html.match(re);
    if (!tag) continue;
    const content = tag[0].match(/content\s*=\s*["']([^"']*)["']/i);
    if (content && content[1].trim()) return decodeEntities(content[1].trim());
  }
  return '';
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=86400',
};

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: JSON_HEADERS });

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return Response.json({ error: 'missing url' }, { status: 400, headers: JSON_HEADERS });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: 'bad url' }, { status: 400, headers: JSON_HEADERS });
  }
  if (!/^https?:$/.test(parsed.protocol) || BLOCKED_HOST.test(parsed.hostname)) {
    return Response.json({ error: 'blocked host' }, { status: 400, headers: JSON_HEADERS });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkNotesBot/1.0; +https://github.com/manowars/sonngo)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi,en;q=0.8,ko;q=0.6',
      },
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) {
      return Response.json({ title: '', note: 'not html' }, { headers: JSON_HEADERS });
    }

    // Titles live in <head>; read at most 256 KB.
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let html = '';
    while (html.length < 262144) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});

    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = pickMeta(html, ['og:title', 'twitter:title'])
      || (titleTag ? decodeEntities(titleTag[1].replace(/\s+/g, ' ').trim()) : '');

    return Response.json({
      url: res.url || parsed.toString(),
      title: title.slice(0, 300),
      description: pickMeta(html, ['og:description', 'twitter:description', 'description']).slice(0, 500),
      image: pickMeta(html, ['og:image', 'twitter:image']).slice(0, 500),
      siteName: pickMeta(html, ['og:site_name']).slice(0, 120),
    }, { headers: JSON_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err.name === 'AbortError' ? 'timeout' : 'fetch failed', title: '' },
      { status: 200, headers: JSON_HEADERS }
    );
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: '/.netlify/functions/meta' };
