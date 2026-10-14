/* 生成应用图标 PNG（无第三方依赖）：node scripts/make-icon.js */
const zlib = require("zlib"), fs = require("fs"), path = require("path");

/* ---------- 极简 PNG 编码器 ---------- */
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, pixel /*fn(x,y)->[r,g,b,a]*/) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) { const p = pixel(x, y); const o = y * (1 + w * 4) + 1 + x * 4;
      raw[o] = p[0]; raw[o + 1] = p[2] === undefined ? p[1] : p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3] === undefined ? 255 : p[3]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; /* RGBA */
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- 图标画布：深墨绿底 + 象牙手稿页（折角 + 墨行 + 酒红落款） ---------- */
const GREEN = [46, 74, 60], GREEN_D = [30, 53, 41], IVORY = [255, 253, 246],
  FOLD = [214, 207, 188], BROWN = [139, 125, 107], WINE = [124, 47, 59];
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function draw(S) {
  const px0 = S * 0.27, px1 = S * 0.73, py0 = S * 0.17, py1 = S * 0.83; /* 页面矩形 */
  const fold = S * 0.10, lw = S * 0.018;
  const inPage = (x, y) => x >= px0 && x <= px1 && y >= py0 && y <= py1;
  const onFold = (x, y) => x > px1 - fold && y < py0 + fold && (px1 - x) + (y - py0) < fold;
  const line = (x, y, yC, xA, xB) => x >= xA && x <= xB && Math.abs(y - yC) <= lw;
  return (x, y) => {
    if (!inPage(x, y)) return x < S * 0.06 || x > S - S * 0.06 || y < S * 0.06 || y > S - S * 0.06 ? GREEN_D : GREEN;
    if (onFold(x, y)) return FOLD;
    const cx0 = px0 + (px1 - px0) * 0.14, cx1 = px1 - (px1 - px0) * 0.14;
    if (onFold(x - 0, y - fold)) return GREEN_D; /* 折角下缘阴影 */
    if (line(x, y, py0 + (py1 - py0) * 0.16, cx0, cx0 + (cx1 - cx0) * 0.5)) return mix(BROWN, IVORY, 0); /* 标题行 */
    if (line(x, y, py0 + (py1 - py0) * 0.34, cx0, cx1)) return BROWN;
    if (line(x, y, py0 + (py1 - py0) * 0.47, cx0, cx1 - (cx1 - cx0) * 0.12)) return BROWN;
    if (line(x, y, py0 + (py1 - py0) * 0.60, cx0, cx1 - (cx1 - cx0) * 0.3)) return BROWN;
    if (line(x, y, py0 + (py1 - py0) * 0.78, cx1 - (cx1 - cx0) * 0.34, cx1 - (cx1 - cx0) * 0.14)) return WINE; /* 酒红落款 */
    return IVORY;
  };
}
const outDir = path.join(__dirname, "..", "icons"); fs.mkdirSync(outDir, { recursive: true });
[[512, "icon-512.png"], [192, "icon-192.png"], [180, "apple-touch-icon.png"]].forEach(([s, f]) => {
  fs.writeFileSync(path.join(outDir, f), png(s, s, draw(s)));
  console.log("已生成 icons/" + f + " (" + s + "px)");
});
