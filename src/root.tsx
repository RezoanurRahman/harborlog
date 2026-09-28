import { component$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import Harborlog from './components/Harborlog';
import './styles.css';

/**
 * Root of the Harborlog app.
 *
 * The document head is rendered only while streaming on the server, where the
 * response is a full document. In the browser the head already belongs to
 * `index.html`, and mounting a second `<head>` from a component would move the
 * real one into the body.
 */
export default component$(() => {
  return (
    <>
      {isServer ? (
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#08131f" />
          <meta
            name="description"
            content="Harborlog — a calm marina maintenance workspace for vessels, work queue, parts and dockside activity."
          />
          <title>Harborlog · Marina operations</title>
        </head>
      ) : null}
      <Harborlog />
    </>
  );
});
