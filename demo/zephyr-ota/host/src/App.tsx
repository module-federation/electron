import { Component, lazy, type ReactNode, Suspense } from 'react';
import './style.css';

const Banner = lazy(() => import('ota_remote_rsbuild/Banner'));
const Card = lazy(() => import('ota_remote_vite/Card'));

class RemoteBoundary extends Component<{ name: string; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <section className="card error" data-ota-error={this.props.name}>
          <h2>{this.props.name} is unavailable</h2>
          <pre>{String(this.state.error)}</pre>
        </section>
      );
    }
    return (
      <Suspense fallback={<section className="card">Loading {this.props.name}…</section>}>
        {this.props.children}
      </Suspense>
    );
  }
}

export function App() {
  return (
    <main>
      <header>
        <div>
          <h1>Zephyr OTA demo</h1>
          <p>
            This window ships inside the app. The two cards below are loaded from Zephyr each time
            the window loads.
          </p>
        </div>
        <button type="button" onClick={() => location.reload()}>
          Check for updates
        </button>
      </header>
      <RemoteBoundary name="ota_remote_rsbuild">
        <Banner />
      </RemoteBoundary>
      <RemoteBoundary name="ota_remote_vite">
        <Card />
      </RemoteBoundary>
    </main>
  );
}
