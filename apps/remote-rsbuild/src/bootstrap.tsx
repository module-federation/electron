import { createRoot } from 'react-dom/client';
import Counter from './Counter.tsx';

createRoot(document.getElementById('root') as HTMLElement).render(<Counter />);
