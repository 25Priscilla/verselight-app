"""
Cuts the church background (src/assets/church-background.webp) into the three layers SlideRenderer draws:
church-background-plain.webp (flame and logo watermark painted out), church-flame.webp (the flame alone),
church-wave.webp (the bottom wave alone) and church-watermark.webp (the watermark as a multiply tint). Prints the measurements copied into src/lib/churchFlame.ts.

Needs Python with numpy, scipy and Pillow. Writes into the current directory:
    python scripts/church-flame-layers.py src/assets/church-background.webp
"""
import sys, numpy as np, json
from PIL import Image
from scipy import ndimage as nd
from scipy.sparse import lil_matrix, csr_matrix
from scipy.sparse.linalg import splu
src = sys.argv[1]
a = np.asarray(Image.open(src).convert('RGB')).astype(float)
H, W = a.shape[:2]
B = a[:, :, 2]
# Top of the bottom wave (its light band), per column: lowest run of 12 light pixels scanning up from the bottom.
top = np.zeros(W, int)
for x in range(W):
    y = H - 1; run = 0
    while y > 0:
        run = run + 1 if B[y, x] > 150 else 0
        if run >= 12: break
        y -= 1
    top[x] = y + 12
top = nd.median_filter(top, 9, mode="nearest")
# The flame's base touches the wave at x 150-330, so the scan there is unreliable: fit a smooth curve to the rest.
xs_fit = np.r_[0:140, 340:720]
poly = np.polyfit(xs_fit, top[xs_fit], 4)
top[:720] = np.round(np.polyval(poly, np.arange(720))).astype(int)
yy, xx = np.mgrid[0:H, 0:W]
above = yy < top[None, :]
cand = (B < 188) & above & (xx < 560)
# The wave's pale top edge is not flame: ignore a thin strip along it, except where the flame's base meets the wave.
cand &= ~((yy >= top[None, :] - 10) & ((xx < 170) | (xx > 305)))
lab, _ = nd.label(cand)
flame = lab == lab[500, 250]
# The pale glow between the flame's lower-left lobe and the wave belongs to the wave; the inner core comes back via hole filling.
flame &= ~((B > 140) & (xx < 200) & (yy > 480))
lab, _ = nd.label(flame)
flame = lab == lab[500, 250]
# close the open inner core using the wave as the floor, then drop the wave again
flame = nd.binary_fill_holes(flame | ~above) & above
flame = nd.binary_closing(flame, iterations=3) & above
flame = nd.binary_fill_holes(flame | ~above) & above
# --- base without the flame: harmonic fill of the flame (+3px fringe), wave and image edges act as walls ---
region = nd.binary_dilation(flame, iterations=4) & above
idx = -np.ones((H, W), int); pts = np.argwhere(region); idx[region] = np.arange(len(pts))
n = len(pts); A = lil_matrix((n, n)); rhs = np.zeros((n, 3))
for k, (y, x) in enumerate(pts):
    deg = 0
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        y2, x2 = y+dy, x+dx
        if not (0 <= y2 < H and 0 <= x2 < W) or not above[y2, x2]: continue
        deg += 1
        if region[y2, x2]: A[k, idx[y2, x2]] = -1
        else: rhs[k] += a[y2, x2]
    A[k, k] = deg
lu = splu(csr_matrix(A).tocsc())
plain = a.copy()
for c in range(3): plain[:, :, c][region] = lu.solve(rhs[:, c])
# --- the faint logo watermark (x 1395-1861, y 50-246): painted out of the base, kept as a "multiply" layer ---
WX0, WY0, WX1, WY1 = 1385, 42, 1872, 256
n = (WX1 - WX0) * (WY1 - WY0)
idx = np.arange(n).reshape(WY1 - WY0, WX1 - WX0)
A = lil_matrix((n, n)); rhs = np.zeros((n, 3))
for y in range(WY0, WY1):
    for x in range(WX0, WX1):
        k = idx[y - WY0, x - WX0]; A[k, k] = 4
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            y2, x2 = y + dy, x + dx
            if WY0 <= y2 < WY1 and WX0 <= x2 < WX1: A[k, idx[y2 - WY0, x2 - WX0]] = -1
            else: rhs[k] += a[y2, x2]
lu = splu(csr_matrix(A).tocsc())
for c in range(3): plain[WY0:WY1, WX0:WX1, c] = lu.solve(rhs[:, c]).reshape(WY1 - WY0, WX1 - WX0)
# The watermark only darkens the cream, so original / plain is a tint that multiplies back to the original (white = none).
tint = np.clip(a[WY0:WY1, WX0:WX1] / np.maximum(plain[WY0:WY1, WX0:WX1], 1), 0, 1) * 255
Image.fromarray(tint.round().astype(np.uint8)).save('church-watermark.webp', lossless=True)
Image.fromarray(np.clip(plain, 0, 255).round().astype(np.uint8)).save('church-background-plain.webp', quality=92, method=6)
# --- flame layer: the flame alone, soft 1px edge, cropped to its box ---
alpha = nd.gaussian_filter(flame.astype(float), 0.8)
alpha[~nd.binary_dilation(flame, iterations=3)] = 0
ys, xs = np.nonzero(flame); x1, y1 = xs.max() + 4, ys.max() + 4
rgba = np.dstack([a, alpha * 255])[:y1, :x1]
Image.fromarray(np.clip(rgba, 0, 255).round().astype(np.uint8), 'RGBA').save('church-flame.webp', quality=92, method=6)
# --- wave layer: everything below the wave's top edge on the left side, to sit in front of the flame ---
wav = (~above) & (xx < 1150)
wa = nd.gaussian_filter(wav.astype(float), 0.7)
rgba = np.dstack([a, wa * 255])
Image.fromarray(np.clip(rgba, 0, 255).round().astype(np.uint8), 'RGBA').save('church-wave.webp', quality=92, method=6)
step = 20
json.dump({'flameW': int(x1), 'flameH': int(y1), 'flameRight': int(xs.max()), 'flameTop': int(ys.min()),
           'step': step, 'wave': [int(top[x]) for x in range(0, 1150 + step, step)]}, open('geom.json', 'w'))
print(json.load(open('geom.json')))
