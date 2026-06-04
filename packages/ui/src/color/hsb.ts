// Concept 2 — HSB ↔ RGB, pure TS. HSB is a UI affordance over the
// RGB channels (there is no HSB ColorValue in the engine model);
// the HSB tab edits these and writes back RGB. Channels: H 0..360,
// S/B 0..100; RGB in IDML units 0..255.

export function rgbToHsb(rgb: number[]): [number, number, number] {
  const r = (rgb[0] ?? 0) / 255;
  const g = (rgb[1] ?? 0) / 255;
  const b = (rgb[2] ?? 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  return [h, s, max * 100];
}

export function hsbToRgb(hsb: number[]): [number, number, number] {
  const h = (((hsb[0] ?? 0) % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, hsb[1] ?? 0)) / 100;
  const v = Math.min(100, Math.max(0, hsb[2] ?? 0)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}
