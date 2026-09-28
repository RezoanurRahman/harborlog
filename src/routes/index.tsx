import { component$ } from '@builder.io/qwik';
import Harborlog from '../components/Harborlog';

/**
 * Route-level entry for the single Harborlog view. The app is intentionally
 * route-free (no Qwik City): this module simply re-exports the dashboard so a
 * host can mount `<Index />` if it prefers a route-shaped import.
 */
export const Index = component$(() => {
  return <Harborlog />;
});

export default Index;
