// Test setup. jsdom has no layout, so SlideRenderer's size observer is a no-op here.
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
}
