// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Toast timeout", () => {
  it("dismisses itself once the timeout has passed since it appeared", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Library backed up." onDismiss={onDismiss} timeout={3000} />);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("starts the timer again when another message replaces it", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast message="First" onDismiss={onDismiss} timeout={3000} />);
    act(() => { vi.advanceTimersByTime(2000); });
    rerender(<Toast message="Second" onDismiss={onDismiss} timeout={3000} />);
    expect(screen.getByText("Second")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clears its timer when it is removed", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="Gone" onDismiss={onDismiss} timeout={3000} />);
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stays until dismissed without a dismiss handler", () => {
    render(<Toast message="Not saved" timeout={3000} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText("Not saved")).toBeTruthy();
  });
});
