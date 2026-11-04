import { useState } from 'react';

export default function Card() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card" data-ota-remote="ota_remote_vite" data-ota-version={__DEMO_VERSION__}>
      <h2>Vite remote · {__DEMO_VERSION__}</h2>
      <p>Built {new Date(__BUILT_AT__).toLocaleString()}</p>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'Show'} details
      </button>
      {open && <p>Loaded at runtime. The app that shows it was not rebuilt.</p>}
    </section>
  );
}
