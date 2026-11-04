import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" data-mf-remote="remote_rsbuild" onClick={() => setCount((c) => c + 1)}>
      Rsbuild remote: clicked {count} times
    </button>
  );
}
