const crypto = require('crypto');

const XOR_TABLE = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];
const PART1_INDICES = [23, 14, 6, 36, 16, 40, 7, 19];
const PART3_INDICES = [16, 1, 32, 12, 19, 27, 8, 5];

function getSign(data) {
  const sha1Hex = crypto.createHash('sha1').update(data).digest('hex').toUpperCase();

  // part1: 从 SHA1 大写十六进制字符串按固定索引取字符（跳过越界索引）
  const part1 = PART1_INDICES.map(i => sha1Hex[i]).filter(c => c !== undefined).join('');

  // part3: 从 SHA1 大写十六进制字符串按固定索引取字符
  const part3 = PART3_INDICES.map(i => sha1Hex[i]).join('');

  // part2: 自定义 base64 编码
  const bytes = [];
  for (let i = 0; i < 20; i++) {
    const byteVal = parseInt(sha1Hex.slice(i * 2, i * 2 + 2), 16);
    bytes.push(byteVal ^ XOR_TABLE[i]);
  }

  const b64 = Buffer.from(bytes).toString('base64');
  const part2 = b64.replace(/[+/=]/g, '');

  return ('zzc' + part1 + part2 + part3).toLowerCase();
}

module.exports = { getSign };
