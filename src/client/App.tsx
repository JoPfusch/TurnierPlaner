import { AdminApp } from './admin/AdminApp';
import { DisplayApp } from './display/DisplayApp';

/**
 * Two entry points share one bundle:
 *   /        full-screen display for the projector
 *   /admin   administration for laptop and phone
 */
export function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminApp /> : <DisplayApp />;
}
