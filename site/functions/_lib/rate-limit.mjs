// Light, best-effort rate limit kept in the Worker isolate's memory. It is per data centre and
// resets when the isolate recycles, which is enough to stop casual guessing of emails/phones.
const hits = new Map();

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export function rateLimited(key, limit, windowMs, now = Date.now()) {
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    if (hits.size > 5000) hits.clear();
  }
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function resetRateLimits() {
  hits.clear();
}
