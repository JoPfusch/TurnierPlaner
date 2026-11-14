import { AdminApp } from './admin/AdminApp';
import { DisplayApp } from './display/DisplayApp';
import { TeamApp } from './team/TeamApp';

/**
 * Two entry points share one bundle:
 *   /        full-screen display for the projector
 *   /admin   administration for laptop and phone
 *   /team    overview for everybody; `/team/<token>` binds a phone to a team
 */
export function App() {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return <AdminApp />;
  if (path.startsWith('/team')) return <TeamApp />;
  return <DisplayApp />;
}
