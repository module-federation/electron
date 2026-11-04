import { useState } from 'react';

export default function Banner() {
  const [count, setCount] = useState(0);
  return (
    <section
      className="card"
      data-ota-remote="ota_remote_rsbuild"
      data-ota-version={__DEMO_VERSION__}
    >
      <h2>Rsbuild remote · {__DEMO_VERSION__}</h2>
      <p>Built {new Date(__BUILT_AT__).toLocaleString()}</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </button>
    </section>
  );
}
