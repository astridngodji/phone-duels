import ArenaPage from "./ArenaPage";
import ControllerPage from "./ControllerPage";

/**
 * Route logic:
 *   /          → Arena (laptop screen)
 *   /controller → Phone controller
 *
 * Works with React Router OR just checks the path directly.
 * Drop-in with your existing router — just add these two routes.
 */
export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/controller")) {
    return <ControllerPage />;
  }

  return <ArenaPage />;
}
