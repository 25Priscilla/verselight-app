/**
 * Built-in background gallery. Every background is original artwork generated here as SVG:
 * no photos or third-party images, so there are no rights to clear, the files are tiny,
 * they work offline, and they stay sharp on any projector resolution.
 * Randomness is seeded, so each background looks the same every time and in every window.
 */

export interface GalleryItem {
  id: string;
  name: string;
  /** Suggested text colour for this background */
  text: string;
  svg: string;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1920;
const H = 1080;
const wrap = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
const r1 = (n: number) => Math.round(n * 10) / 10;

function dawn(): string {
  return wrap(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#1c2340"/><stop offset=".45" stop-color="#5b4a73"/>
       <stop offset=".72" stop-color="#d98a6a"/><stop offset="1" stop-color="#f6c98a"/></linearGradient>
     <radialGradient id="sun" cx=".5" cy=".78" r=".45">
       <stop offset="0" stop-color="#fff2cf" stop-opacity=".95"/><stop offset=".25" stop-color="#ffd59a" stop-opacity=".5"/>
       <stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#sun)"/>
     <path d="M0 860 C 320 800 560 830 820 850 S 1400 790 1920 830 V1080 H0Z" fill="#3a2e45" opacity=".85"/>
     <path d="M0 930 C 400 880 700 940 1100 915 S 1650 900 1920 940 V1080 H0Z" fill="#231c30"/>`,
  );
}

function rays(): string {
  const r = rng(7);
  let beams = "";
  for (let i = 0; i < 14; i++) {
    const a = -70 + i * 10 + (r() - 0.5) * 6;
    const w = 2 + r() * 4;
    beams += `<path d="M960 -80 L ${r1(960 + Math.tan(((a - w) * Math.PI) / 180) * 1300)} 1200 L ${r1(960 + Math.tan(((a + w) * Math.PI) / 180) * 1300)} 1200Z" fill="#cfe0ff" opacity="${r1(0.05 + r() * 0.09)}"/>`;
  }
  return wrap(
    `<radialGradient id="bg" cx=".5" cy="0" r="1.1">
       <stop offset="0" stop-color="#3c5a9a"/><stop offset=".5" stop-color="#16234a"/><stop offset="1" stop-color="#080d1f"/></radialGradient>
     <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/><g filter="url(#soft)">${beams}</g>
     <ellipse cx="960" cy="-40" rx="420" ry="220" fill="#e8f0ff" opacity=".35" filter="url(#soft)"/>`,
  );
}

function water(): string {
  const r = rng(21);
  let lines = "";
  for (let i = 0; i < 60; i++) {
    const y = 600 + Math.pow(r(), 1.6) * 480;
    const x = r() * W;
    const len = 60 + r() * 260 * ((y - 560) / 520);
    lines += `<rect x="${r1(x - len / 2)}" y="${r1(y)}" width="${r1(len)}" height="${r1(1.5 + ((y - 600) / 480) * 3)}" rx="2" fill="#bfe3ea" opacity="${r1(0.08 + r() * 0.18)}"/>`;
  }
  return wrap(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0b1f2e"/><stop offset=".55" stop-color="#2f6475"/><stop offset=".56" stop-color="#1f4a57"/>
       <stop offset="1" stop-color="#07151e"/></linearGradient>
     <radialGradient id="glow" cx=".5" cy=".55" r=".4">
       <stop offset="0" stop-color="#e5f6f2" stop-opacity=".45"/><stop offset="1" stop-color="#e5f6f2" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
     <path d="M0 596 C 300 560 520 575 760 590 S 1300 560 1920 592 V600 H0Z" fill="#163a46" opacity=".9"/>${lines}`,
  );
}

function glass(): string {
  const r = rng(99);
  const palette = ["#7a1f3d", "#1f4f8a", "#2c7a6b", "#b3832a", "#5a2f7a", "#1d6a8f", "#8c3b24"];
  const cols = 12;
  const rows = 7;
  const pts: [number, number][][] = [];
  for (let y = 0; y <= rows; y++) {
    const row: [number, number][] = [];
    for (let x = 0; x <= cols; x++) {
      const jx = x === 0 || x === cols ? 0 : (r() - 0.5) * 110;
      const jy = y === 0 || y === rows ? 0 : (r() - 0.5) * 110;
      row.push([r1((x * W) / cols + jx), r1((y * H) / rows + jy)]);
    }
    pts.push(row);
  }
  let tris = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [a, b, c, d] = [pts[y][x], pts[y][x + 1], pts[y + 1][x], pts[y + 1][x + 1]];
      for (const t of r() > 0.5 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]) {
        const fill = palette[Math.floor(r() * palette.length)];
        tris += `<path d="M${t.map((p) => p.join(" ")).join(" L")}Z" fill="${fill}" opacity="${r1(0.55 + r() * 0.45)}"/>`;
      }
    }
  }
  return wrap(
    `<radialGradient id="light" cx=".5" cy=".35" r=".8">
       <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="#120e16"/><g stroke="#0c0a0f" stroke-width="7" stroke-linejoin="round">${tris}</g>
     <rect width="${W}" height="${H}" fill="url(#light)"/>`,
  );
}

function candle(): string {
  const r = rng(314);
  let dots = "";
  for (let i = 0; i < 46; i++) {
    const rad = 30 + r() * 110;
    const hue = ["#ffcf7a", "#ffb45c", "#ffe2a8", "#f59a4a"][Math.floor(r() * 4)];
    dots += `<circle cx="${r1(r() * W)}" cy="${r1(200 + r() * 880)}" r="${r1(rad)}" fill="${hue}" opacity="${r1(0.08 + r() * 0.22)}"/>`;
  }
  return wrap(
    `<radialGradient id="bg" cx=".5" cy=".85" r=".9">
       <stop offset="0" stop-color="#4a2a12"/><stop offset=".55" stop-color="#1c110b"/><stop offset="1" stop-color="#0a0706"/></radialGradient>
     <filter id="bokeh"><feGaussianBlur stdDeviation="14"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/><g filter="url(#bokeh)">${dots}</g>`,
  );
}

function hill(): string {
  return wrap(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#141b33"/><stop offset=".5" stop-color="#3b3358"/><stop offset=".85" stop-color="#b8676a"/>
       <stop offset="1" stop-color="#e7a97a"/></linearGradient>
     <radialGradient id="halo" cx=".5" cy=".62" r=".35">
       <stop offset="0" stop-color="#ffe7c2" stop-opacity=".55"/><stop offset="1" stop-color="#ffe7c2" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#halo)"/>
     <path d="M0 900 C 380 860 700 760 960 740 C 1220 760 1540 860 1920 890 V1080 H0Z" fill="#1a1426"/>
     <g fill="#120e1b"><rect x="948" y="520" width="24" height="236" rx="3"/><rect x="890" y="580" width="140" height="22" rx="3"/></g>
     <path d="M0 980 C 500 940 1300 1000 1920 960 V1080 H0Z" fill="#0d0a14"/>`,
  );
}

function stars(): string {
  const r = rng(2024);
  let s = "";
  for (let i = 0; i < 380; i++) {
    const size = Math.pow(r(), 6) * 2.8 + 0.5;
    s += `<circle cx="${r1(r() * W)}" cy="${r1(r() * H)}" r="${r1(size)}" fill="#fff" opacity="${r1(0.3 + r() * 0.7)}"/>`;
  }
  return wrap(
    `<radialGradient id="neb" cx=".3" cy=".4" r=".6">
       <stop offset="0" stop-color="#4b3a86" stop-opacity=".6"/><stop offset="1" stop-color="#4b3a86" stop-opacity="0"/></radialGradient>
     <radialGradient id="neb2" cx=".75" cy=".7" r=".5">
       <stop offset="0" stop-color="#1f5d7a" stop-opacity=".5"/><stop offset="1" stop-color="#1f5d7a" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="#05060f"/><rect width="${W}" height="${H}" fill="url(#neb)"/>
     <rect width="${W}" height="${H}" fill="url(#neb2)"/>${s}`,
  );
}

function mist(): string {
  let waves = "";
  const colors = ["#6d5a8f", "#8e6a93", "#b37d98", "#d49aa4", "#e9bfb4"];
  colors.forEach((c, i) => {
    const y = 380 + i * 150;
    waves += `<path d="M0 ${y} C 480 ${y - 120} 900 ${y + 110} 1300 ${y - 20} S 1800 ${y - 90} 1920 ${y - 40} V1080 H0Z" fill="${c}" opacity=".55"/>`;
  });
  return wrap(
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2340"/><stop offset="1" stop-color="#4a3a5c"/></linearGradient>
     <filter id="haze"><feGaussianBlur stdDeviation="30"/></filter>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/><g filter="url(#haze)">${waves}</g>`,
  );
}

export const GALLERY: GalleryItem[] = [
  { id: "dawn", name: "Dawn", text: "#fffaf0", svg: dawn() },
  { id: "rays", name: "Light rays", text: "#ffffff", svg: rays() },
  { id: "water", name: "Still water", text: "#f4fbfb", svg: water() },
  { id: "glass", name: "Stained glass", text: "#fff8ec", svg: glass() },
  { id: "candle", name: "Candlelight", text: "#fff4e0", svg: candle() },
  { id: "hill", name: "Cross at dusk", text: "#fff6ee", svg: hill() },
  { id: "stars", name: "Night sky", text: "#ffffff", svg: stars() },
  { id: "mist", name: "Mist", text: "#fffafc", svg: mist() },
];

const urls = new Map<string, string>();
export function galleryUrl(id: string): string {
  let url = urls.get(id);
  if (!url) {
    const item = GALLERY.find((g) => g.id === id) ?? GALLERY[0];
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`;
    urls.set(id, url);
  }
  return url;
}
