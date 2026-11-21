/* HairsbyDinma · Hair engine
 * Recolours the hair and changes its length on a photo, in the browser.
 *  - Hair is found per pixel: dark and low-saturation (black hair); skin, the
 *    cream top, the gold stand and the beige backdrop are left alone.
 *  - Colour: hair brightness is mapped onto a colour ramp, keeping the hair's
 *    own light and shadow. "Highlight" colours add soft vertical streaks.
 *  - Length: below a pivot line (around the neck), longer hair is stretched
 *    down over the photo. Shorter hair compresses that part of the photo up.
 * Results are cached as object URLs.
 */
(() => {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  // Colour ramps sampled from the colour references (Figma, Section 12):
  // nine tones each, from the deepest shadow to the shine on a wave.
  const PALETTES = {
    'Natural Black': null,
    'Dark Brown Highlight': {
      base: ['#060403', '#0d0907', '#140e0b', '#1b130f', '#231914', '#2d2019', '#392920', '#49352a', '#634a3a'],
      hl: ['#1e0d07', '#331709', '#4a2612', '#5b331e', '#6c412c', '#7c4e38', '#8e5d46', '#a5735b', '#c99a7f'],
      hlAmt: 0.85,
    },
    'Light Brown Highlight': {
      base: ['#120905', '#20120a', '#2f1b0f', '#3e2516', '#4d301e', '#5c3b27', '#6c4732', '#7f5841', '#9e7459'],
      hl: ['#4f2c12', '#76461f', '#955e29', '#b07637', '#c38946', '#d39a55', '#e1aa64', '#edbc78', '#f8d398'],
      hlAmt: 0.9,
    },
    // Blonde and Ginger: no recolouring for now; the swatch stays in the UI but the hair stays natural black
    'Blonde': null,
    'Ginger': null,
  };
  function lut(stops) {
    const s = stops.map(hex), n = s.length - 1, out = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const f = (i / 255) * n, j = Math.min(n - 1, Math.floor(f)), k = f - j;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = s[j][c] + (s[j + 1][c] - s[j][c]) * k;
    }
    return out;
  }
  const LUTS = {};
  for (const [name, p] of Object.entries(PALETTES)) LUTS[name] = p && { base: lut(p.base), hl: p.hl && lut(p.hl), hlAmt: p.hlAmt || 0 };

  // How much a pixel looks like (black) hair: 0..1
  // mode 0: near skin (strict, so face shadows, brows and lashes stay out)
  // mode 1: away from skin (dark warm-brown curls and rim light count as hair)
  // mode 2: below the neck, where there is no skin at all (warm hair ends count too)
  function hairW(r, g, b, mode = 0) {
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const top = mode === 2 ? 0.6 : 0.52;
    if (L >= top) return 0;
    const wd = L <= 0.28 ? 1 : (top - L) / (top - 0.28);
    if (L < (mode ? 0.1 : 0.06)) return wd; // near-black is always hair (islands like nostrils are dropped later)
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = (mx - mn) / mx;
    // very dark pixels read as more saturated than they are, so allow more there
    const lo = mode === 2 ? (L < 0.35 ? 0.62 : 0.4)
      : mode === 1 ? (L < 0.18 ? 0.6 : L < 0.3 ? 0.6 - (L - 0.18) / 0.12 * 0.28 : 0.32)
      : L < 0.2 ? 0.32 + 0.2 * (0.2 - L) / 0.15 : 0.32;
    let ws = sat <= lo ? 1 : sat >= lo + 0.18 ? 0 : (lo + 0.18 - sat) / 0.18;
    if (mode === 2 && sat > 0.4 && (r - g) / (r - b + 1) < 0.42) ws *= 0.2; // gold stand, not hair
    return wd * ws;
  }
  // skin-toned pixel (mid brightness, warm and saturated)
  function isSkin(r, g, b) {
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (L < 0.22 || L > 0.68 || !(r >= g && g >= b)) return 0;
    const sat = (r - b) / r;
    return sat > 0.48 && sat < 0.8 ? 1 : 0;
  }

  const RELAX = 0.52; // fraction of the photo height below which the relaxed test applies

  // Smooth row mapping: slope 1 at the pivot easing to 1/s further down
  const R = 90;
  const mapRow = (t, inv) => t * inv + (1 - inv) * R * (1 - Math.exp(-t / R));

  function warp(sd, od, W, H, P, s, relax) {
    const inv = 1 / s, RL = H * relax;
    for (let y = P; y < H; y++) {
      let sy = P + mapRow(y - P, inv);
      if (sy > H - 1) sy = H - 1;
      const y0 = Math.floor(sy), y1 = Math.min(H - 1, y0 + 1), f = sy - y0, nf = 1 - f;
      const r0 = y0 * W * 4, r1 = y1 * W * 4, ro = y * W * 4;
      for (let x = 0, i = 0; x < W; x++, i += 4) {
        const r = sd[r0 + i] * nf + sd[r1 + i] * f;
        const g = sd[r0 + i + 1] * nf + sd[r1 + i + 1] * f;
        const b = sd[r0 + i + 2] * nf + sd[r1 + i + 2] * f;
        if (s < 1) { od[ro + i] = r; od[ro + i + 1] = g; od[ro + i + 2] = b; continue; }
        // hair from the stretched photo; where it has a gap but the original had hair,
        // take the stretched background too, so the old hair ends never show through
        const mode = y > RL ? 2 : 0;
        const a = Math.max(hairW(r, g, b, mode), hairW(od[ro + i], od[ro + i + 1], od[ro + i + 2], mode));
        if (a > 0) {
          od[ro + i] += (r - od[ro + i]) * a;
          od[ro + i + 1] += (g - od[ro + i + 1]) * a;
          od[ro + i + 2] += (b - od[ro + i + 2]) * a;
        }
      }
    }
  }

  // Separable box blur (mean), edges normalised
  function blur(src, W, H, r) {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const o = y * W; let acc = 0, n = 0;
      for (let x = 0; x < r && x < W; x++) { acc += src[o + x]; n++; }
      for (let x = 0; x < W; x++) {
        if (x + r < W) { acc += src[o + x + r]; n++; }
        if (x - r - 1 >= 0) { acc -= src[o + x - r - 1]; n--; }
        tmp[o + x] = acc / n;
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0, n = 0;
      for (let y = 0; y < r && y < H; y++) { acc += tmp[y * W + x]; n++; }
      for (let y = 0; y < H; y++) {
        if (y + r < H) { acc += tmp[(y + r) * W + x]; n++; }
        if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * W + x]; n--; }
        out[y * W + x] = acc / n;
      }
    }
    return out;
  }
  const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };
  // Smooth value noise in 0..1, for natural-looking highlight placement
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // straight / wavy hair: long ribbons; curly / coily hair: clumps that follow the curls
  const HL_SHAPES = {
    straight: [[9, 140, 0.6], [4, 70, 0.4]],
    wavy: [[11, 55, 0.6], [5, 26, 0.4]],
    curly: [[13, 24, 0.6], [6, 10, 0.4]],
  };
  const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  function recolour(d, W, H, C, texture, relax = RELAX) {
    const shape = HL_SHAPES[texture] || HL_SHAPES.straight, k = W / 506;
    const N = W * H;
    // 1. Hair mask, and what is clearly not hair (the background to un-mix against)
    const m = new Float32Array(N), bgm = new Float32Array(N);
    const mr = new Float32Array(N), mg = new Float32Array(N), mb = new Float32Array(N);
    const br = new Float32Array(N), bg = new Float32Array(N), bb = new Float32Array(N);
    const RL = Math.round(H * relax) * W;
    const sk = new Float32Array(N);
    for (let p = 0, i = 0; p < N; p++, i += 4) sk[p] = isSkin(d[i], d[i + 1], d[i + 2]);
    const skD = blur(sk, W, H, Math.max(5, Math.round(W / 50)));
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const w = hairW(r, g, b, p > RL ? 2 : skD[p] < 0.06 ? 1 : 0);
      m[p] = w; mr[p] = w * r; mg[p] = w * g; mb[p] = w * b;
      const nb = w > 0 ? 0 : 1; bgm[p] = nb; br[p] = nb * r; bg[p] = nb * g; bb[p] = nb * b;
    }
    // 2. Body of hair vs small dark islands (brows, lashes, eye make-up, nostrils):
    //    keep only large connected dark regions, then soften that outline
    //    Thin links (lashes touching a lock of hair) are cut first by eroding the mask.
    const bin = new Float32Array(N);
    for (let p = 0; p < N; p++) bin[p] = m[p] >= 0.45 ? 1 : 0;
    const re = Math.max(2, Math.round(W / 200));
    const ero = blur(bin, W, H, re);
    const core = new Uint8Array(N);
    for (let p = 0; p < N; p++) core[p] = p > RL ? bin[p] : ero[p] > 0.97 ? 1 : 0; // no face below the neck: keep thin ends joined
    const lab = new Int32Array(N), stack = new Int32Array(N), sizes = [0];
    for (let p0 = 0; p0 < N; p0++) {
      if (lab[p0] || !core[p0]) continue;
      const id = sizes.length; let sp = 0, cnt = 0; stack[sp++] = p0; lab[p0] = id;
      while (sp) {
        const q = stack[--sp], qx = q % W; cnt++;
        if (qx > 0 && !lab[q - 1] && core[q - 1]) { lab[q - 1] = id; stack[sp++] = q - 1; }
        if (qx < W - 1 && !lab[q + 1] && core[q + 1]) { lab[q + 1] = id; stack[sp++] = q + 1; }
        if (q >= W && !lab[q - W] && core[q - W]) { lab[q - W] = id; stack[sp++] = q - W; }
        if (q < N - W && !lab[q + W] && core[q + W]) { lab[q + W] = id; stack[sp++] = q + W; }
      }
      sizes.push(cnt);
    }
    const minArea = N * 0.003, bigCore = new Float32Array(N);
    for (let p = 0; p < N; p++) bigCore[p] = lab[p] && sizes[lab[p]] >= minArea ? 1 : 0;
    // grow back to the full outline of those regions
    const grown = blur(bigCore, W, H, re + 1), big = new Float32Array(N);
    for (let p = 0; p < N; p++) big[p] = bin[p] && grown[p] > 0 ? 1 : 0;
    const R0 = Math.max(4, Math.round(W / 64));
    const dens = blur(big, W, H, R0);
    // loose curls just outside the main mass (away from the face) still count
    const far = blur(big, W, H, Math.max(8, Math.round(W / 22)));
    // 3. Local hair colour and local background colour, for clean edges
    const r1 = Math.max(2, Math.round(W / 130));
    const Mn = blur(m, W, H, 1);
    const M1 = blur(m, W, H, r1), MR = blur(mr, W, H, r1), MG = blur(mg, W, H, r1), MB = blur(mb, W, H, r1);
    const B1 = blur(bgm, W, H, r1 + 1), BR = blur(br, W, H, r1 + 1), BG = blur(bg, W, H, r1 + 1), BB = blur(bb, W, H, r1 + 1);
    // 4. Tone matching: where each hair pixel sits in this photo's own light-to-dark range
    const hist = new Float64Array(256); let tot = 0;
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      if (m[p] > 0.85 && big[p]) { hist[Math.min(255, Math.round(lum(d[i], d[i + 1], d[i + 2]) * 255))]++; tot++; }
    }
    const cdf = new Float32Array(256); let acc = 0;
    for (let k = 0; k < 256; k++) { cdf[k] = tot ? (acc + hist[k] / 2) / tot : k / 255; acc += hist[k]; }
    const tone = L => {
      const q = cdf[Math.min(255, Math.max(0, Math.round(L * 255)))];
      const lin = Math.min(1, Math.max(0, (L - 0.015) / 0.34));
      return 0.72 * q + 0.28 * lin;
    };
    // 5. Paint
    const Ls = new Float32Array(N);
    for (let p = 0, i = 0; p < N; p++, i += 4) Ls[p] = lum(d[i], d[i + 1], d[i + 2]);
    const Lsb = blur(Ls, W, H, 1);
    const c1 = [0, 0, 0], c2 = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (M1[p] < 0.02 || (m[p] <= 0 && Mn[p] < 0.2)) continue;
        const keep = big[p] ? 1 : Math.max(sstep(0.02, 0.25, dens[p]), p > RL || skD[p] < 0.06 ? sstep(0.01, 0.08, far[p]) : 0);
        if (keep <= 0) continue;
        const i = p * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        const own = m[p], L = lum(r, g, b);
        if (own < 0.6 && isSkin(r, g, b)) continue; // the model's skin is never painted
        // new hair colour at tone t (with highlight pieces for the highlight colours)
        const paint = (t, out) => {
          const ti = Math.round(t * 255) * 3;
          let nr = C.base[ti], ng = C.base[ti + 1], nb = C.base[ti + 2];
          if (C.hl) {
            // soft vertical stripes that sway gently down the hair (the first style),
            // feathered into individual strands so the edges blend instead of cutting off
            const xs = x / k, ys = y / k;
            const n = Math.sin(xs * 0.045 + Math.sin(ys * 0.012) * 1.8 + Math.sin(ys * 0.004) * 0.8);
            const strand = 0.7 + 0.3 * vnoise(xs / 2.2, ys / 45);
            const h = sstep(0.15, 0.9, n) * strand * C.hlAmt * (0.45 + 0.55 * t);
            if (h > 0) { nr += (C.hl[ti] - nr) * h; ng += (C.hl[ti + 1] - ng) * h; nb += (C.hl[ti + 2] - nb) * h; }
          }
          out[0] = nr; out[1] = ng; out[2] = nb;
        };
        // A. the pixel is hair in its own tone
        paint(tone(0.55 * L + 0.45 * Lsb[p]), c1);
        // near the background, a lighter pixel is usually a hair/background mix, not shine
        let q = sstep(0.7, 0.97, own) * (1 - sstep(0.03, 0.25, B1[p])), o0 = c1[0], o1 = c1[1], o2 = c1[2];
        // B. the pixel is a mix of nearby hair and nearby background (edges, see-through tips):
        //    separate the two, recolour only the hair share, keep the strand texture
        const lh = M1[p] > 1e-3 ? 1 / M1[p] : 0;
        if (q < 1 && lh && B1[p] > 0.02) {
          const hr = MR[p] * lh, hg = MG[p] * lh, hb = MB[p] * lh;
          const lb = 1 / B1[p], cr = BR[p] * lb, cg = BG[p] * lb, cb = BB[p] * lb;
          const vr = cr - hr, vg = cg - hg, vb = cb - hb, vv = vr * vr + vg * vg + vb * vb;
          if (vv > 400) {
            let sh = ((r - hr) * vr + (g - hg) * vg + (b - hb) * vb) / vv;
            sh = sh < 0 ? 0 : sh > 1 ? 1 : sh;
            let a = Math.min(1 - sh, Math.max(own * 4, Mn[p] * 2));
            const cl = v => (v < -22 ? -22 : v > 22 ? 22 : v);
            const er = cl(r - (cr - a * vr)), eg = cl(g - (cg - a * vg)), eb = cl(b - (cb - a * vb)); // strand detail
            a = 1 - Math.pow(1 - a, 1.35); // slightly fuller fine ends
            // edges and tips get a solid mid tone (no shine), so they read as filled with colour
            paint(Math.min(0.55, tone(Math.min(lum(hr, hg, hb), L))), c2);
            const m0 = cr + a * (c2[0] - cr) + er, m1 = cg + a * (c2[1] - cg) + eg, m2 = cb + a * (c2[2] - cb) + eb;
            o0 = q * o0 + (1 - q) * m0; o1 = q * o1 + (1 - q) * m1; o2 = q * o2 + (1 - q) * m2;
          }
        }
        // inside the hair (no background nearby) shiny, lighter strands are still hair
        const w = keep * (lh && B1[p] > 0.02 ? 1 : Math.max(own, M1[p]));
        d[i] = r + w * (o0 - r); d[i + 1] = g + w * (o1 - g); d[i + 2] = b + w * (o2 - b);
      }
    }
  }

  const imgs = new Map();
  const loadImg = src => {
    if (!imgs.has(src)) imgs.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
    return imgs.get(src);
  };
  const outs = new Map();

  /** Returns a promise of an image URL with the hair recoloured / resized. */
  function render(src, { colour = 'Natural Black', scale = 1, pivot = 0.46, texture = 'straight', relax = RELAX } = {}) {
    const C = LUTS[colour];
    const sc = Math.round(scale * 1000) / 1000;
    if (!C && sc === 1) return loadImg(src).then(() => src);
    const key = `${src}|${colour}|${sc}|${pivot}|${texture}|${relax}`;
    if (!outs.has(key)) {
      outs.set(key, (async () => {
        const img = await loadImg(src);
        const W = img.naturalWidth, H = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, W, H);
        if (sc !== 1) { const sd = new Uint8ClampedArray(data.data); warp(sd, data.data, W, H, Math.round(pivot * H), sc, relax); }
        if (C) recolour(data.data, W, H, C, texture, relax);
        ctx.putImageData(data, 0, 0);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
        return URL.createObjectURL(blob);
      })());
    }
    return outs.get(key);
  }

  window.HairEngine = { render, loadImg };
})();
