import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

/**
 * Production entry.
 *
 * The host (Elysia on the Node adapter, or any other Node server) supplies a
 * `stream` writer and gets hydrated markup back. The client manifest is
 * injected by `qwikVite()` at build time; it lets the server preload the right
 * Qwik chunks so hydration stays fast.
 */
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
    containerAttributes: {
      lang: 'en',
      ...opts.containerAttributes,
    },
  });
}
