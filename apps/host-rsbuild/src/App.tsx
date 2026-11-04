import { Component, lazy, type ReactNode, Suspense } from 'react';

const Counter = lazy(() => import('remote_rsbuild/Counter'));
const Card = lazy(() => import('remote_vite/Card'));

class RemoteBoundary extends Component<{ name: string; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <pre data-mf-error={this.props.name}>{String(this.state.error)}</pre>;
    }
    return <Suspense fallback={<p>Loading {this.props.name}…</p>}>{this.props.children}</Suspense>;
  }
}

export function App() {
  return (
    <main>
      <h1>Host built with Rsbuild</h1>
      <RemoteBoundary name="remote_rsbuild">
        <Counter />
      </RemoteBoundary>
      <RemoteBoundary name="remote_vite">
        <Card />
      </RemoteBoundary>
    </main>
  );
}
