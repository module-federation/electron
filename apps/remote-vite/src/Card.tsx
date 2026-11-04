import { useState } from 'react';

export default function Card() {
  const [open, setOpen] = useState(false);
  return (
    <section data-mf-remote="remote_vite">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Vite remote: {open ? 'hide' : 'show'} details
      </button>
      {open && <p>Loaded from an ESM remote built with Vite.</p>}
    </section>
  );
}
