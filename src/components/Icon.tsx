const PATHS = {
  book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  prev: "M15 18l-6-6 6-6",
  next: "M9 18l6-6-6-6",
  up: "M18 15l-6-6-6 6",
  down: "M6 9l6 6 6-6",
  x: "M18 6 6 18M6 6l12 12",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
  stop: "M6 6h12v12H6z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  type: "M4 7V5h11v2M9.5 5v14M7 19h5M14 12h6M17 12v7M15.5 19h3",
  eyeOff: "M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 10 7a13.6 13.6 0 0 1-3.2 3.9M6.6 6.6C4.3 8 2.8 10.4 2 12c1 2 5 7 10 7a9.4 9.4 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  square: "M5 5h14v14H5z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  more: "M12 6h.01M12 12h.01M12 18h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17.5M15.5 9.5h.01",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  upload: "M12 16V5M7 10l5-5 5 5M5 20h14",
  bookmark: "M6 4h12v17l-6-4-6 4z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  study: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.3-4.3M8 11h6M11 8v6",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = name === "play" || name === "stop" || name === "square";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="icon"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
