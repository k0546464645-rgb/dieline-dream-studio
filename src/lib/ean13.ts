const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const P = ["LLLLLL","LLGLGL","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

export function ean13Check(d12: string) {
  const s = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (s % 10)) % 10);
}

/** Returns vector SVG group markup for an EAN-13 barcode, or null if the code is invalid. */
export function ean13Svg(raw: string, x: number, y: number, module = 3): string | null {
  let code = raw.replace(/\D/g, "");
  if (code.length === 12) code += ean13Check(code);
  if (code.length !== 13 || ean13Check(code.slice(0, 12)) !== code[12]) return null;
  const first = Number(code[0]);
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (P[first]![i - 1] === "L" ? L : G)[Number(code[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
  bits += "101";
  const h = module * 26;
  const q = module * 9;
  let rects = "";
  [...bits].forEach((b, i) => {
    if (b !== "1") return;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    rects += `<rect x="${q + i * module}" y="0" width="${module}" height="${guard ? h + module * 4 : h}"/>`;
  });
  const fs = module * 4;
  const W = q * 2 + 95 * module;
  return `<g id="Barcode" data-name="Barcode" transform="translate(${x} ${y})">
    <rect x="0" y="${-module * 2}" width="${W}" height="${h + fs + module * 8}" fill="#ffffff"/>
    <g fill="#000000">${rects}</g>
    <text x="${W / 2}" y="${h + fs + module * 3}" font-family="OCR-B, Arial, sans-serif" font-size="${fs}" text-anchor="middle" letter-spacing="${module}">${code}</text>
  </g>`;
}
