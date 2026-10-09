// ESA-only adapter: leave the existing router, authentication and APIs intact.
import originalEntry from './index.js';

// Update the cache version whenever the ESA-only import UI changes.
const UI_SCRIPT = '/assets/esa-style-import-ui.js?v=20261009-visibility-v3';

export default {
  async fetch(request, context, env = {}) {
    const response = await originalEntry.fetch(request, context, env);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const html = await response.text();
    if (!html.includes('/assets/admin.js') || html.includes(UI_SCRIPT)) {
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    const injected = html.replace(
      /<\/body\s*>/i,
      `  <script src="${UI_SCRIPT}" defer></script>\n</body>`
    );
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    return new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
