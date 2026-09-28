import { render, type RenderOptions } from '@builder.io/qwik';
import Root from './root';

/**
 * Development entry. `index.html` loads this module directly and Qwik renders
 * the application into `document` (nothing is server rendered in dev).
 */
export default function (opts: RenderOptions) {
  return render(document, <Root />, opts);
}
