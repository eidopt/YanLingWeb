import { App } from './App';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'src/app/globals.css';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
