# QQ音乐Cookie长期有效方案 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用QQ音乐内部API（musics.fcg）实现扫码登录获取musickey，替代已被403封死的ptlogin2方案，同时删除旧的测试Cookie功能。

**Architecture:** 1) 在sidecar中实现zzc sign算法，用于调用QQ音乐musics.fcg接口；2) 通过musics.fcg的GetQRCode/GetQRCodeStatus/QRCodeLogin三个接口完成扫码登录；3) 登录成功后获取musickey（即qqmusic_key Cookie），支持refreshToken续期；4) 前端删除旧的ptlogin2扫码登录和测试Cookie UI，替换为新的扫码登录流程。

**Tech Stack:** Node.js (sidecar), zzc sign算法 (crypto/SHA1 + 自定义base64), React/TypeScript (前端), Zustand (状态管理)

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 创建 | `src-tauri/binaries/meting-api/qq-sign.js` | zzc sign算法纯算实现 |
| 修改 | `src-tauri/binaries/meting-api/server.js` | 新增3个扫码登录端点，删除旧的ptlogin2端点 |
| 修改 | `src/components/SettingsPage.tsx` | 删除旧扫码登录UI和测试Cookie按钮，替换为新扫码登录流程 |
| 修改 | `src/stores/configStore.ts` | 新增musickey/refreshToken存储 |

---

### Task 1: 实现zzc sign算法

**Files:**
- 创建: `src-tauri/binaries/meting-api/qq-sign.js`

**背景:** QQ音乐 musics.fcg 接口需要 sign 参数验证请求合法性。sign 格式为 `zzc` + part1 + part2 + part3，其中 part1/part3 从 SHA1 结果按固定索引取字符，part2 是自定义 base64 编码。

- [ ] **Step 1: 创建 qq-sign.js，实现完整的 zzc sign 算法**

```javascript
// qq-sign.js - QQ音乐 zzc sign 算法纯算还原
const crypto = require('crypto');

// SHA1 哈希
function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex').toUpperCase();
}

// part1 和 part3 的索引数组（从 SHA1 结果中取字符）
const ARR1 = [16, 1, 32, 12, 19, 27, 8, 5];  // part3
const ARR2 = [23, 14, 6, 36, 16, 40, 7, 19]; // part1

// 自定义 base64 字符表
const BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

// XOR 固定数组（20字节）
const XOR_TABLE = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];

// 十六进制字符到数值的映射
const HEX_MAP = { '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'A':10,'B':11,'C':12,'D':13,'E':14,'F':15 };

/**
 * 生成 part2（自定义 base64 编码）
 * 算法：对 SHA1 结果的十六进制字符串，每两个字符为一组，
 * 第一个字符 * 16 + 第二个字符 得到一个字节值，
 * 再与 XOR_TABLE 对应位置异或，得到 20 字节数组，
 * 最后用自定义 base64 编码
 */
function encodePart2(sha1Hex) {
  const bytes = [];
  for (let i = 0; i < 20; i++) {
    const hi = HEX_MAP[sha1Hex[i * 2]];
    const lo = HEX_MAP[sha1Hex[i * 2 + 1]];
    const val = (hi * 16 + lo) ^ XOR_TABLE[i];
    bytes.push(val);
  }
  // 自定义 base64 编码（3字节→4字符，不足补=）
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += BASE64_MAP[b0 >> 2];
    result += BASE64_MAP[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) {
      result += BASE64_MAP[((b1 & 15) << 2) | (b2 >> 6)];
    } else {
      result += '=';
    }
    if (i + 2 < bytes.length) {
      result += BASE64_MAP[b2 & 63];
    } else {
      result += '=';
    }
  }
  return result.replace(/[+/=]/g, ''); // 去掉 +/=
}

/**
 * 生成 zzc sign
 * @param {string} data - POST 请求的 body（JSON 字符串）
 * @returns {string} sign 值
 */
function getSign(data) {
  const sha1Hex = sha1(data);

  // part1: 从 SHA1 结果按 ARR2 索引取字符
  let part1 = '';
  for (const idx of ARR2) {
    if (idx < sha1Hex.length) part1 += sha1Hex[idx];
  }

  // part2: 自定义 base64 编码
  const part2 = encodePart2(sha1Hex);

  // part3: 从 SHA1 结果按 ARR1 索引取字符
  let part3 = '';
  for (const idx of ARR1) {
    if (idx < sha1Hex.length) part3 += sha1Hex[idx];
  }

  return ('zzc' + part1 + part2 + part3).toLowerCase();
}

module.exports = { getSign };
```

- [ ] **Step 2: 验证 sign 算法正确性**

运行测试：`cd src-tauri/binaries/meting-api && node -e "const {getSign} = require('./qq-sign'); console.log(getSign('123')); console.log(getSign('hello world'))"`

预期输出：
- `getSign('123')` → `zzcec1b555gzqzg7laztguyjl2bu20r6x1w50c55f60`（与 jixun.uk 的测试向量一致）
- `getSign('hello world')` → `zzcfb3415bc4nfoxmd9uik71mkomtubjfjp141a1cbbcc`

如果输出不匹配，需要调整 ARR1/ARR2 索引或 XOR_TABLE 数值。

---

### Task 2: 在 sidecar 中实现新的扫码登录端点

**Files:**
- 修改: `src-tauri/binaries/meting-api/server.js`

**背景:** 删除旧的 ptlogin2 扫码登录端点（`/tencent/qr/show`、`/tencent/qr/check`），替换为基于 musics.fcg 的新端点。

**新端点设计：**
- `GET /tencent/qr/show` → 调用 musics.fcg 的 `QQConnectLogin.LoginServer.GetQQCode` 获取二维码
- `GET /tencent/qr/check?session_id=xxx` → 调用 musics.fcg 的 `QQConnectLogin.LoginServer.CheckQQLogin` 检查扫码状态
- 扫码成功后，调用 `music.key.KeyServer.GetMusicKey` 获取 musickey + refreshToken

- [ ] **Step 1: 删除 server.js 中旧的 ptlogin2 扫码登录代码**

删除以下函数和相关引用：
- `handleTencentQRShow`（旧的 ptlogin2 xlogin + ptqrshow 流程）
- `handleTencentQRCheck`（旧的 ptlogin2 ptqrlogin 轮询流程）
- `followRedirectsWithCookies`（旧的 ptlogin2 重定向跟随）
- `httpGetRaw`（如果仅被旧扫码登录使用）
- `qqLoginSessions` Map（替换为新的 session 存储）
- `node-awesome-tls` 相关代码（`initAwesomeTLS`、`tlsGetRaw`、`tlsGetBinary`、`tlsFollowRedirects`）——不再需要，因为 musics.fcg 不做 TLS 指纹检测

- [ ] **Step 2: 在 server.js 顶部引入 qq-sign.js**

```javascript
const { getSign } = require('./qq-sign');
```

- [ ] **Step 3: 实现新的 session 存储**

```javascript
// 新的扫码登录 session 存储
const qrSessions = new Map(); // sessionId -> { qrcodeID, token, createdAt }
```

- [ ] **Step 4: 实现新的 handleTencentQRShow**

```javascript
async function handleTencentQRShow(req, res) {
  try {
    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      'QQConnectLogin.LoginServer.GetQQCode': {
        module: 'QQConnectLogin.LoginServer',
        method: 'GetQQCode',
        param: {}
      }
    });
    const sign = getSign(data);
    const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
      },
      body: data,
    });
    const json = await response.json();
    const result = json['QQConnectLogin.LoginServer.GetQQCode'];

    if (!result || result.code !== 0) {
      return errorResponse(res, 502, '获取二维码失败', JSON.stringify(result));
    }

    const { qrcode, qrcodeID, token } = result.data;
    const sessionId = crypto.randomBytes(16).toString('hex');
    qrSessions.set(sessionId, { qrcodeID, token, createdAt: Date.now() });

    // qrcode 是 base64 图片或 URL，需要确认格式
    jsonResponse(res, 200, {
      success: true,
      base64: qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`,
      session_id: sessionId,
    });
  } catch (err) {
    console.error('[Tencent/QR/Show Error]:', err.message);
    errorResponse(res, 502, '获取QQ音乐二维码失败', err.message);
  }
}
```

- [ ] **Step 5: 实现新的 handleTencentQRCheck**

```javascript
async function handleTencentQRCheck(req, res, query) {
  try {
    const sessionId = query.session_id;
    if (!sessionId || !qrSessions.has(sessionId)) {
      return errorResponse(res, 400, '无效的 session_id');
    }
    const session = qrSessions.get(sessionId);

    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      'QQConnectLogin.LoginServer.CheckQQLogin': {
        module: 'QQConnectLogin.LoginServer',
        method: 'CheckQQLogin',
        param: { qrcodeID: session.qrcodeID, token: session.token }
      }
    });
    const sign = getSign(data);
    const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
      },
      body: data,
    });
    const json = await response.json();
    const result = json['QQConnectLogin.LoginServer.CheckQQLogin'];

    if (!result) {
      return jsonResponse(res, 200, { success: false, status: 'waiting', msg: '等待扫码' });
    }

    // 状态码含义：0=未扫码, 1=已扫码待确认, 2=已确认(成功), 3=已过期
    const statusCode = result.code;
    if (statusCode === 2 && result.data && result.data.loginCode) {
      // 登录成功，获取 musickey
      const musicKeyResult = await getMusicKey(result.data.loginCode);
      if (musicKeyResult.success) {
        qrSessions.delete(sessionId);
        return jsonResponse(res, 200, {
          success: true,
          status: 'confirmed',
          musickey: musicKeyResult.musickey,
          refreshToken: musicKeyResult.refreshToken,
          msg: '登录成功',
        });
      } else {
        return jsonResponse(res, 200, {
          success: false,
          status: 'confirmed_but_key_failed',
          loginCode: result.data.loginCode,
          msg: musicKeyResult.msg,
        });
      }
    } else if (statusCode === 1) {
      return jsonResponse(res, 200, { success: false, status: 'scanned', msg: '已扫码，等待确认' });
    } else if (statusCode === 3) {
      qrSessions.delete(sessionId);
      return jsonResponse(res, 200, { success: false, status: 'expired', msg: '二维码已过期' });
    } else {
      return jsonResponse(res, 200, { success: false, status: 'waiting', msg: '等待扫码' });
    }
  } catch (err) {
    console.error('[Tencent/QR/Check Error]:', err.message);
    errorResponse(res, 502, '检查登录状态失败', err.message);
  }
}
```

- [ ] **Step 6: 实现 getMusicKey 和 refreshMusicKey**

```javascript
async function getMusicKey(loginCode) {
  try {
    const guid = Math.floor(Math.random() * 2147483647);
    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      'music.key.KeyServer.GetMusicKey': {
        module: 'music.key.KeyServer',
        method: 'GetMusicKey',
        param: { guid: String(guid), loginCode: loginCode }
      }
    });
    const sign = getSign(data);
    const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
      },
      body: data,
    });
    const json = await response.json();
    const result = json['music.key.KeyServer.GetMusicKey'];
    if (result && result.code === 0 && result.data) {
      return {
        success: true,
        musickey: result.data.musickey,
        refreshToken: result.data.refresh_token || result.data.refreshToken,
      };
    }
    return { success: false, msg: '获取musickey失败: ' + JSON.stringify(result) };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

async function refreshMusicKey(refreshToken) {
  try {
    const data = JSON.stringify({
      comm: { ct: 24, cv: 0 },
      'music.key.KeyServer.RefreshMusicKey': {
        module: 'music.key.KeyServer',
        method: 'RefreshMusicKey',
        param: { refresh_token: refreshToken }
      }
    });
    const sign = getSign(data);
    const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com/',
      },
      body: data,
    });
    const json = await response.json();
    const result = json['music.key.KeyServer.RefreshMusicKey'];
    if (result && result.code === 0 && result.data) {
      return { success: true, musickey: result.data.musickey, refreshToken: result.data.refresh_token || result.data.refreshToken };
    }
    return { success: false, msg: '刷新musickey失败: ' + JSON.stringify(result) };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}
```

- [ ] **Step 7: 注册新端点路由**

在 server.js 的路由部分，确保 `/tencent/qr/show` 和 `/tencent/qr/check` 指向新函数。新增 `/tencent/qr/refresh` 端点用于续期。

- [ ] **Step 8: 清理 node-awesome-tls 依赖**

从 server.js 中删除 `initAwesomeTLS`、`tlsGetRaw`、`tlsGetBinary`、`tlsFollowRedirects` 函数。从 tencent.js 中删除 `setTlsClient` 和 `_tlsGetRaw` 相关代码。可以保留 `node-awesome-tls` 在 node_modules 中（不影响运行），但不再使用。

---

### Task 3: 重写前端扫码登录 UI

**Files:**
- 修改: `src/components/SettingsPage.tsx`
- 修改: `src/stores/configStore.ts`

**背景:** 删除旧的 ptlogin2 扫码登录 UI 和测试 Cookie 按钮，替换为新的扫码登录流程。新流程：点击"扫码登录" → 显示二维码 → 轮询检查状态 → 成功后自动保存 musickey。

- [ ] **Step 1: 在 configStore 中新增 musickey/refreshToken 存储**

在 `configStore.ts` 中新增：
```typescript
musickey: string | null;
refreshToken: string | null;
setMusickey: (key: string | null) => void;
setRefreshToken: (token: string | null) => void;
```

- [ ] **Step 2: 删除 SettingsPage.tsx 中旧的扫码登录代码**

删除：
- `handleStartQRLogin` 函数（旧的 ptlogin2 流程）
- `qrLoginState` 相关状态
- 旧的二维码显示和轮询逻辑
- "测试 Cookie" 按钮和 `testingCookie`/`cookieTestResult` 状态
- "在浏览器中登录" 按钮

- [ ] **Step 3: 实现新的扫码登录 UI**

新的扫码登录流程：
1. 点击"扫码登录"按钮 → 调用 `/tencent/qr/show` 获取二维码
2. 显示二维码图片 + "请使用QQ/微信/QQ音乐APP扫描二维码" 提示
3. 每2秒轮询 `/tencent/qr/check?session_id=xxx`
4. 状态变化：waiting → scanned → confirmed
5. confirmed 后自动保存 musickey 到 configStore
6. 显示成功提示 + "Cookie 已自动保存"

```typescript
const [qrState, setQrState] = useState<'idle' | 'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error'>('idle');
const [qrBase64, setQrBase64] = useState('');
const [qrSessionId, setQrSessionId] = useState('');
const qrPollRef = useRef<number | null>(null);

const startQRLogin = async () => {
  setQrState('loading');
  try {
    const res = await fetch(`http://127.0.0.1:${sidecarPort}/tencent/qr/show`);
    const json = await res.json();
    if (json.success) {
      setQrBase64(json.base64);
      setQrSessionId(json.session_id);
      setQrState('waiting');
      startQRPoll();
    } else {
      setQrState('error');
    }
  } catch {
    setQrState('error');
  }
};

const startQRPoll = () => {
  if (qrPollRef.current) clearInterval(qrPollRef.current);
  qrPollRef.current = window.setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${sidecarPort}/tencent/qr/check?session_id=${qrSessionId}`);
      const json = await res.json();
      if (json.status === 'scanned') setQrState('scanned');
      if (json.status === 'confirmed') {
        setQrState('confirmed');
        if (qrPollRef.current) clearInterval(qrPollRef.current);
        // 自动保存 musickey
        setCookie('tencent', json.musickey);
        setMusickey(json.musickey);
        setRefreshToken(json.refreshToken);
      }
      if (json.status === 'expired') {
        setQrState('expired');
        if (qrPollRef.current) clearInterval(qrPollRef.current);
      }
    } catch { /* ignore */ }
  }, 2000);
};
```

- [ ] **Step 4: 渲染扫码登录 UI**

```tsx
{key === 'tencent' && (
  <div style={{ marginTop: 8 }}>
    {qrState === 'idle' && (
      <button onClick={startQRLogin} style={{...}}>扫码登录</button>
    )}
    {qrState === 'loading' && <span>加载中...</span>}
    {(qrState === 'waiting' || qrState === 'scanned') && (
      <div>
        <img src={qrBase64} style={{ width: 180, height: 180 }} />
        <p>{qrState === 'waiting' ? '请扫描二维码' : '已扫码，请在手机上确认'}</p>
        <button onClick={() => { setQrState('idle'); /* cleanup */ }}>取消</button>
      </div>
    )}
    {qrState === 'confirmed' && <span style={{ color: '#4ade80' }}>登录成功，Cookie已自动保存</span>}
    {qrState === 'expired' && (
      <div>
        <span style={{ color: '#f87171' }}>二维码已过期</span>
        <button onClick={startQRLogin}>重新获取</button>
      </div>
    )}
    {qrState === 'error' && (
      <div>
        <span style={{ color: '#f87171' }}>获取二维码失败</span>
        <button onClick={startQRLogin}>重试</button>
      </div>
    )}
  </div>
)}
```

---

### Task 4: 集成 musickey 到播放 URL 获取

**Files:**
- 修改: `src-tauri/binaries/meting-api/platforms/tencent.js`

**背景:** 获取到 musickey 后，需要在 tencent.js 的 url() 函数中使用它来获取可播放的音频 URL。musickey 作为 Cookie 中的 `qqmusic_key` 传递给 QQ 音乐 API。

- [ ] **Step 1: 修改 tencent.js 的 url() 函数，使用 musickey 获取播放 URL**

在 url() 函数中，如果传入了 cookie（包含 musickey），则使用 `music.vkey.GetVkey` 接口（通过 musics.fcg + sign）获取带签名的播放 URL：

```javascript
async function url(songMid, bitrate = 320, cookie) {
  // 如果有 musickey，使用 musics.fcg + sign 获取播放 URL
  if (cookie) {
    try {
      const guid = Math.floor(Math.random() * 2147483647);
      const filename = `C400${songMid}.m4a`;
      const data = JSON.stringify({
        comm: { ct: 24, cv: 0 },
        req: {
          module: 'music.vkey.GetVkey',
          method: 'GetUrl',
          param: {
            guid: String(guid),
            songmid: [songMid],
            songtype: [0],
            uin: '0',
            loginflag: 1,
            platform: '20',
            filename: [filename],
          }
        }
      });
      const sign = getSign(data);
      const url = `https://u6.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://y.qq.com/',
          'Cookie': `qqmusic_key=${cookie}`,
        },
        body: data,
      });
      const json = await response.json();
      const vkeyData = json.req;
      if (vkeyData && vkeyData.code === 0 && vkeyData.data && vkeyData.data.midurlinfo) {
        const info = vkeyData.data.midurlinfo[0];
        if (info && info.purl) {
          const prefix = vkeyData.data.sip && vkeyData.data.sip[0] ? vkeyData.data.sip[0] : 'https://dl.stream.qqmusic.qq.com/';
          return prefix + info.purl;
        }
      }
    } catch (e) {
      console.warn('[Tencent/url] musics.fcg failed:', e.message);
    }
  }

  // 回退到旧的 fcg_play_single_song.fcg
  // ... 保留原有逻辑作为无 Cookie 时的回退
}
```

- [ ] **Step 2: 在 tencent.js 中引入 qq-sign.js**

```javascript
const { getSign } = require('../qq-sign');
```

---

### Task 5: 端到端测试验证

- [ ] **Step 1: 启动 sidecar，测试 `/tencent/qr/show` 端点**

```bash
cd src-tauri/binaries/meting-api && node server.js
# 另一个终端
curl http://127.0.0.1:3000/tencent/qr/show
```

预期：返回 `{ success: true, base64: "data:image/png;base64,...", session_id: "..." }`

- [ ] **Step 2: 启动 Tauri 开发版，测试完整扫码登录流程**

```bash
cd melodix && npm run tauri dev
```

1. 进入 Settings → Account & Cookies
2. 点击"扫码登录"
3. 用 QQ/微信/QQ音乐 APP 扫描二维码
4. 确认登录
5. 验证 musickey 自动保存
6. 搜索歌曲并播放，验证播放 URL 可用

- [ ] **Step 3: TypeScript 编译验证**

```bash
cd melodix && npx tsc --noEmit
```

预期：0 errors

---

## 风险与注意事项

1. **musics.fcg 接口参数名可能不完全准确**：`QQConnectLogin.LoginServer.GetQQCode` 等接口名来自搜索结果和推测，实际可能需要调整。如果返回错误，需要抓包 y.qq.com 网页版的实际请求来确认接口名和参数。
2. **zzc sign 算法的 XOR_TABLE 和索引数组可能随 QQ 音乐前端更新而变化**：需要定期验证。如果 sign 验证失败，需要重新从 y.qq.com 的 vendor.chunk.js 中提取。
3. **musickey 有效期**：根据搜索结果，musickey 可以通过 refreshToken 续期，但具体有效期和续期频率需要实际测试。
4. **二维码格式**：`GetQQCode` 返回的 qrcode 字段可能是 base64 图片、URL 或 SVG，需要根据实际返回格式调整前端渲染逻辑。
