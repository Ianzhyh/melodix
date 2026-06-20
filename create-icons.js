import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1x1 transparent PNG bytes
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0x4A, 0x01, 0x1B, 0x8E, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

// Write PNG icons
fs.writeFileSync(path.join(iconsDir, '32x32.png'), pngBytes);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), pngBytes);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), pngBytes);

// Construct ICO bytes
const pngLen = pngBytes.length;
const icoHeader = Buffer.from([
  0x00, 0x00, // Reserved
  0x01, 0x00, // Type 1 (ICO)
  0x01, 0x00  // Number of images
]);

const icoEntry = Buffer.alloc(16);
icoEntry.writeUInt8(16, 0); // Width 16
icoEntry.writeUInt8(16, 1); // Height 16
icoEntry.writeUInt8(0, 2);  // Colors
icoEntry.writeUInt8(0, 3);  // Reserved
icoEntry.writeUInt16LE(1, 4);  // Color planes
icoEntry.writeUInt16LE(32, 6); // Bits per pixel
icoEntry.writeUInt32LE(pngLen, 8); // Size of image data
icoEntry.writeUInt32LE(22, 12); // Offset of image data (6 header + 16 entry)

const icoBytes = Buffer.concat([icoHeader, icoEntry, pngBytes]);
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBytes);

// Construct a dummy ICNS (Apple Icon Image) file
// Minimal ICNS has a header: 'icns' (4 bytes) + length (4 bytes)
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 4, 'ascii');
icnsHeader.writeUInt32BE(8, 4); // Total size = 8 bytes for an empty icns file
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icnsHeader);

console.log('All dummy icons successfully generated in src-tauri/icons!');
