import { ControlApp } from "./components/ControlApp";
import { PresentationView } from "./components/PresentationView";
import { isPresentationWindow } from "./lib/display";
import { LibraryProvider } from "./state/library";

export default function App() {
  if (isPresentationWindow()) return <PresentationView />;
  return (
    <LibraryProvider>
      <ControlApp />
    </LibraryProvider>
  );
}
