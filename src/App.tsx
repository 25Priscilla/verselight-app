import { lazy, Suspense } from "react";
import { ControlApp } from "./components/ControlApp";
import { PresentationView } from "./components/PresentationView";
import { isPresentationWindow } from "./lib/display";
import { LibraryProvider } from "./state/library";

// Development only: /?gallery shows every shared component. Not part of production builds.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import("./dev/ComponentGallery").then((m) => ({ default: m.ComponentGallery }))) : null;

export default function App() {
  if (isPresentationWindow()) return <PresentationView />;
  if (ComponentGallery && new URLSearchParams(location.search).has("gallery")) return <Suspense><ComponentGallery /></Suspense>;
  return (
    <LibraryProvider>
      <ControlApp />
    </LibraryProvider>
  );
}
