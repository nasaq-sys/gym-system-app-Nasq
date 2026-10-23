/** Encodes the short signed attendance token as a self-contained QR Model 2 symbol.
 * Version 8, medium error correction, byte mode. No image service or QR package is used.
 */
const SIZE = 49;
const DATA_CODEWORDS = 154;
const ECC_CODEWORDS = 22;
const BLOCKS = 4;

function multiply(a: number, b: number): number {
  let product = 0;
  for (let i = 0; i < 8; i++) {
    if ((b & 1) !== 0) product ^= a;
    b >>>= 1;
    a = (a << 1) ^ ((a & 0x80) !== 0 ? 0x11d : 0);
  }
  return product;
}

function errorCorrection(data: number[]): number[] {
  const divisor = Array(ECC_CODEWORDS).fill(0);
  divisor[ECC_CODEWORDS - 1] = 1;
  let root = 1;
  for (let i = 0; i < ECC_CODEWORDS; i++) {
    for (let j = 0; j < divisor.length; j++) {
      divisor[j] = multiply(divisor[j], root);
      if (j + 1 < divisor.length) divisor[j] ^= divisor[j + 1];
    }
    root = multiply(root, 2);
  }
  const remainder = Array(ECC_CODEWORDS).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let i = 0; i < ECC_CODEWORDS; i++) remainder[i] ^= multiply(divisor[i], factor);
  }
  return remainder;
}

function encodeCodewords(value: string): number[] {
  const bytes = new TextEncoder().encode(value);
  // Version 8-M has 154 data codewords, including 4 mode and 8 count bits.
  if (bytes.length > 152) throw new RangeError("Attendance token exceeds QR capacity");
  const bits: number[] = [];
  const push = (number: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((number >>> i) & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((result, bit) => (result << 1) | bit, 0));
  }
  while (data.length < DATA_CODEWORDS) data.push(data.length % 2 === 0 ? 0xec : 0x11);

  const groups: { data: number[]; ecc: number[] }[] = [];
  let offset = 0;
  for (let i = 0; i < BLOCKS; i++) {
    const length = i < 2 ? 38 : 39;
    const block = data.slice(offset, offset + length);
    groups.push({ data: block, ecc: errorCorrection(block) });
    offset += length;
  }
  const result: number[] = [];
  for (let i = 0; i < 39; i++) for (const block of groups) if (i < block.data.length) result.push(block.data[i]);
  for (let i = 0; i < ECC_CODEWORDS; i++) for (const block of groups) result.push(block.ecc[i]);
  return result;
}

/** Returns the black/white module matrix, including the required 4-module quiet border. */
export function encodeMemberQr(value: string): boolean[][] {
  const modules = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };
  for (let i = 0; i < SIZE; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [SIZE - 4, 3], [3, SIZE - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, distance !== 2 && distance !== 4);
    }
  }
  for (const x of [6, 24, 42]) for (const y of [6, 24, 42]) {
    if ((x === 6 && y === 6) || (x === 6 && y === 42) || (x === 42 && y === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Reserve both format-info copies before placing data.
  for (let i = 0; i <= 5; i++) set(8, i, false);
  set(8, 7, false); set(8, 8, false); set(7, 8, false);
  for (let i = 9; i < 15; i++) set(14 - i, 8, false);
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, false);
  set(8, SIZE - 8, true);

  let versionRemainder = 8;
  for (let i = 0; i < 12; i++) versionRemainder = (versionRemainder << 1) ^ ((versionRemainder >>> 11) * 0x1f25);
  const versionBits = (8 << 12) | versionRemainder;
  for (let i = 0; i < 18; i++) {
    const a = SIZE - 11 + i % 3;
    const b = Math.floor(i / 3);
    set(a, b, ((versionBits >>> i) & 1) !== 0);
    set(b, a, ((versionBits >>> i) & 1) !== 0);
  }

  const codewords = encodeCodewords(value);
  let bitIndex = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let row = 0; row < SIZE; row++) for (let dx = 0; dx < 2; dx++) {
      const x = right - dx;
      const y = ((right + 1) & 2) === 0 ? SIZE - 1 - row : row;
      if (!reserved[y][x]) {
        if (bitIndex < codewords.length * 8) modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
        bitIndex++;
      }
    }
  }
  if (bitIndex < codewords.length * 8) throw new Error("QR data area is too small");

  // Mask 0: alternate cells. Keep function modules untouched.
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!reserved[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
  }
  let formatRemainder = 0; // Medium correction level has format bits 00; mask 0.
  for (let i = 0; i < 10; i++) formatRemainder = (formatRemainder << 1) ^ ((formatRemainder >>> 9) * 0x537);
  const formatBits = formatRemainder ^ 0x5412;
  const format = (index: number) => ((formatBits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, format(i));
  set(8, 7, format(6)); set(8, 8, format(7)); set(7, 8, format(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, format(i));
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, format(i));
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, format(i));
  set(8, SIZE - 8, true);

  return Array.from({ length: SIZE + 8 }, (_, y) =>
    Array.from({ length: SIZE + 8 }, (_, x) => x >= 4 && y >= 4 && x < SIZE + 4 && y < SIZE + 4 ? modules[y - 4][x - 4] : false)
  );
}
