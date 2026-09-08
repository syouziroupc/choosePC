export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = 'inoso-mosaic-overlay.syouziroupc.workers.dev';
    upstream.port = '';
    const headers = new Headers(request.headers);
    headers.set('Host', upstream.hostname);
    return fetch(new Request(upstream.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'follow'
    }));
  }
};
