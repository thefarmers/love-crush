import './styles.css';
import { App } from './ui/app';

const app = new App(document.getElementById('app')!);
if (import.meta.env.DEV) (window as unknown as { __lc: App }).__lc = app;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
