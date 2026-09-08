export default {
  async fetch(request) {
    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = 'inoso-mosaic-overlay.syouziroupc.workers.dev';
    upstream.port = '';
    return fetch(new Request(upstream.toString(), request));
  }
};
