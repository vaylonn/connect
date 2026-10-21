// Limites par adresse : essais refusés (phrase de passe, mot de passe du serveur) et créations de coffre.
// Compteurs à fenêtre fixe, en mémoire (un seul processus) ou dans Redis (partagés entre les fonctions Vercel).

// Adresse du client ; en IPv6, son préfixe /64 : un même appareil y change souvent d'adresse.
export function clientKey(ip) {
  ip = String(ip || '').trim().toLowerCase().replace(/^::ffff:(?=[\d.]+$)/, '');
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function memoryCounter() {
  const counts = new Map(); // clé -> { n, until }
  const live = k => { const c = counts.get(k); if (c && c.until > Date.now()) return c; counts.delete(k); return null; };
  return {
    count: async k => live(k)?.n || 0,
    async hit(k, seconds) {
      const c = live(k) || { n: 0, until: Date.now() + seconds * 1000 };
      c.n++; counts.set(k, c);
      if (counts.size > 10000) counts.delete(counts.keys().next().value);
      return c.n;
    },
  };
}

// cmd : envoie une commande Redis et renvoie sa réponse (voir vault.mjs)
const HIT = "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n";
export function redisCounter(cmd) {
  const key = k => 'carnet:limit:' + k;
  return {
    count: async k => +(await cmd(['GET', key(k)])) || 0,
    hit: async (k, seconds) => +(await cmd(['EVAL', HIT, '1', key(k), String(seconds)])),
  };
}
