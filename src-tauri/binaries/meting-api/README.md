# 🎵 Meting Music API — 自建服务部署指南

> 基于 [metowolf/Meting](https://github.com/metowolf/Meting) (Node.js) 的多平台音乐 API 服务
> 
> **支持平台：** 网易云 / QQ音乐(腾讯) / 酷狗 / 酷我 / 百度
>
> **核心特性：** 🚀 轻量快速（仅依赖 `@meting/core`）| 🔐 内置加密 | ⚡ 可链式API | 🔄 统一数据格式

---

## 📁 项目结构

```
meting-api/
├── package.json          # 依赖配置（仅需 @meting/core）
├── server.js             # 主服务文件（9个端点，生产级功能）
├── test.js               # 一键测试脚本
├── ecosystem.config.js   # PM2 进程管理配置
└── README.md             # 本文件
```

---

## 🚀 一、服务器环境要求

| 项目 | 要求 |
|------|------|
| **操作系统** | Linux（推荐 CentOS 7+ / Ubuntu 20+） |
| **Node.js** | ≥ 12.0.0（建议 ≥ 16 LTS） |
| **内存** | ≥ 256MB |
| **端口** | 默认 `3300`（可通过环境变量修改） |

---

## 🔧 二、安装步骤

### 步骤 1：安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 或使用 nvm 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### 步骤 2：上传项目到服务器

将整个 `meting-api` 文件夹上传到服务器：
```bash
# 推荐路径
/var/www/meting-api/
# 或者
/www/server/meting-api/
```

### 步骤 3：安装依赖并启动

```bash
cd /var/www/meting-api/

# 安装依赖（仅需 @meting/core 一个包）
npm install --production

# 测试启动
node server.js
```

启动后访问测试：
- `http://你的IP:3300/` — 查看 API 文档
- `http://你的IP:3300/health` — 健康检查
- `http://你的IP:3300/search?server=netease&id=周杰伦&page=1&limit=5` — 搜索测试

### 步骤 4：使用 PM2 守护进程（推荐）

```bash
# 全局安装 PM2
npm install pm2@latest -g

# 启动服务
cd /var/www/meting-api/
pm2 start server.js --name "meting-api"

# 设置开机自启
pm2 save
pm2 startup
# （按提示执行输出的命令）

# 常用 PM2 命令
pm2 list                    # 查看所有进程
pm2 logs meting-api         # 查看日志
pm2 restart meting-api      # 重启
pm2 stop meting-api         # 停止
pm2 monit                  # 监控面板

# 或使用 ecosystem 配置文件启动
pm2 start ecosystem.config.js
```

---

## 🌐 三、Nginx 反向代理配置

通过宝塔面板或直接编辑 Nginx 配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 IP
    
    # Meting API 反向代理 — 推荐：/api/ 前缀方式
    location /api/ {
        rewrite ^/api/(.*) /$1 break;   # 去掉 /api 前缀转发到后端
        proxy_pass http://127.0.0.1:3300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # 音乐接口可能较慢，适当放宽超时
        proxy_connect_timeout 15s;
        proxy_read_timeout 30s;
        proxy_send_timeout 15s;
    }
    
    # 你的音乐播放器前端
    location / {
        root /var/www/music-player;  # index.html 所在目录
        index index.html;
        try_files $uri $uri/ =404;
    }
}
```

### 宝塔面板操作步骤：

1. 打开宝塔 → 网站 → 添加站点（填入域名）
2. 点击站点 → **反向代理** → 添加反向代理：
   - **代理名称**：`meting-api`
   - **目标URL**：`http://127.0.0.1:3300`
   - **发送域名**：`$host`
3. 如果需要 `/api/` 前缀：在代理设置中添加重写规则 `^/api/(.*) /$1 break`

---

## 🍪 四、Cookie 配置（重要！获取 VIP 歌曲、版权歌曲等高级功能）

部分网易云 VIP 歌曲、版权保护歌曲需要登录 Cookie 才能获取真实播放链接。

### 如何获取网易云 Cookie

1. 用浏览器打开 [music.163.com](https://music.163.com) 并**登录**
2. 按 `F12` 打开开发者工具
3. 切换到 **Application**（应用程序）→ **Cookies** → `https://music.163.com`
4. 复制名为 `MUSIC_U` 的值（一长串字符串）
5. 完整 Cookie 格式：`MUSIC_U=你复制的值;`

### 配置方法

**方式 A：环境变量（推荐）**

```bash
export METING_COOKIES='{"netease":"MUSIC_U=你的cookie值;","tencent":""}'
```

在 PM2 中使用：
```bash
pm2 start server.js --name "meting-api" \
  --env METING_COOKIES='{"netease":"MUSIC_U=xxx;"}'

# 或在 ecosystem.config.js 中配置
```

**方式 B：直接编辑 server.js**

找到 CONFIG.cookies 部分：
```javascript
cookies: {
  netease: 'MUSIC_U=你的值;',
  tencent: '',
},
```

---

## 🔗 五、前端对接说明

部署成功后，在你的音乐播放器 `index.html` 中修改以下变量：

```javascript
// ===== 将这些地址替换为你的自建服务 =====

// 方式一：Nginx 反代 /api/ （推荐 ✅）
const METING_API = "/api";
const METING_ALT = "/api";
const METING_BACKUP = "/api";

// 方式二：直接暴露端口（不推荐生产环境 ❌）
const METING_API = "http://你的IP:3300";
const METING_ALT = "http://你的IP:3300";
const METING_BACKUP = "http://你的IP:3300";
```

### 前端调用示例

```javascript
// 搜索歌曲
const res = await fetch('/api/search?server=netease&id=周杰伦&page=1&limit=10');
const json = await res.json();
console.log(json.data); // [{id, name, artist, album, url_id, lyric_id, pic_id, source}, ...]

// 获取播放URL（url_id 来自搜索结果）
const urlRes = await fetch(`/api/url?server=netease&id=${song.url_id}&r=320`);
const urlJson = await urlRes.json();
audio.src = urlJson.data.url;

// 获取歌词（lyric_id 来自搜索结果）
const lrcRes = await fetch(`/api/lyric?server=netease&id=${song.lyric_id}`);
const lrcJson = await lrcRes.json();
// lrcJson.data.lrc 或 data.plain 或 data.raw

// 获取封面（pic_id 来自搜索结果）
// GET /pic 会自动 302 重定向到图片地址
img.src = `/api/pic?server=netease&id=${song.pic_id}&size=300`;
```

---

## ⚙️ 六、自定义配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3300` | 服务端口 |
| `METING_COOKIES` | `null` | JSON 格式的平台 Cookie |

### server.js CONFIG 对象

```javascript
const CONFIG = {
  port: parseInt(process.env.PORT) || 3300,
  
  timeout: 12000,              // 单请求超时(ms)
  
  rateLimit: {                 // 限流配置
    enabled: true,
    windowMs: 60 * 1000,       // 时间窗口 1分钟
    maxRequests: 120,          // 最大请求数/分钟
  },

  corsOrigins: '*',            // CORS 允许来源（* 表示全部允许）

  platformMap: {               // 平台代码映射
    'netease': 'netease',      // 网易云音乐
    'tencent': 'tencent',      // QQ音乐(腾讯)
    'kugou':   'kugou',        // 酷狗音乐
    'kuwo':    'kuwo',         // 酷我音乐
    'baidu':   'baidu',        // 百度音乐
  },

  cookies: process.env.METING_COOKIES ? JSON.parse(process.env.METING_COOKIES) : null,
};
```

---

## 🧪 七、API 完整文档

### 所有可用端点（9个）

| 端点 | 方法 | 必填参数 | 可选参数 | 说明 |
|------|------|---------|---------|------|
| `/health` | GET | — | — | 健康检查 & 运行状态 |
| `/search` | GET | `server`, `id`(关键词) | `page`, `limit`, `type` | 搜索歌曲/专辑/歌手 |
| `/url` | GET | `server`, `id`(歌曲ID) | `r`(音质) | 获取播放链接 |
| `/lyric` | GET | `server`, `id`(歌曲ID) | — | 获取歌词(LRC格式) |
| `/pic` | GET | `server`, `id`(图片ID) | `size`(像素) | 获取封面(302重定向) |
| `/song` | GET | `server`, `id`(歌曲ID) | — | 获取歌曲详情 |
| `/album` | GET | `server`, `id`(专辑ID) | — | 获取专辑信息 |
| `/artist` | GET | `server`, `id`(歌手ID) | `limit` | 获取歌手歌曲列表 |
| `/playlist` | GET | `server`, `id`(歌单ID) | — | 获取歌单内容 |

### 平台代码 (server 参数)

| 平台 | 代码 | 搜索 | 歌曲详情 | 专辑 | 歌手 | 歌单 | URL | 歌词 | 封面 |
|------|------|:---:|:-------:|:---:|:---:|:---:|:--:|:--:|:--:|
| **网易云音乐** | `netease` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **QQ音乐(腾讯)** | `tencent` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **酷狗音乐** | `kugou` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **酷我音乐** | `kuwo` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **百度音乐** | `baidu` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 音质参数 (r 参数)

| 值 | 说明 |
|----|------|
| `128` | 标准音质 (128kbps MP3) |
| `192` | 较高音质 (192kbps MP3) |
| `320` | 高品质 (320kbps MP3) |
| `999` | 无损品质 (FLAC) |

### 搜索类型 (type 参数)

| 值 | 含义 | 适用平台 |
|----|------|---------|
| `1` | 搜索歌曲（默认） | 网易云等 |
| `10` | 搜索专辑 | 网易云等 |
| `100` | 搜索歌手 | 网易云等 |

### 示例请求

```bash
# ========== 搜索 ==========
curl "http://localhost:3300/search?server=netease&id=周杰伦&page=1&limit=5"
# 返回：[{id, name, artist:[], album, pic_id, url_id, lyric_id, source}, ...]

# ========== 获取播放链接 ==========
curl "http://localhost:3300/url?server=netease&id=35847388&r=320"
# 返回：{ success:true, data:{ url:"https://..." } }

# ========== 获取歌词 ==========
curl "http://localhost:3300/lyric?server=netease&id=35847388"
# 返回：{ success:true, data:{ lrc:"[00:00.00]..." } }

# ========== 获取封面（返回 302 重定向） ==========
curl -v "http://localhost:3300/pic?server=netease&id=1407374890649284&size=300"

# ========== 歌曲详情 ==========
curl "http://localhost:3300/song?server=netease&id=35847388"

# ========== 专辑信息 ==========
curl "http://localhost:3300/album?server=netease&id=12345"

# ========== 歌手歌曲列表 ==========
curl "http://localhost:3300/artist?server=netease&id=6452&limit=10"

# ========== 歌单内容 ==========
curl "http://localhost:3300/playlist?server=netease&id=71384714"

# ========== 健康检查 ==========
curl "http://localhost:3300/health"
```

### 统一搜索结果格式 (`format(true)`)

启用统一格式后，所有平台的搜索结果都返回标准结构：

```json
[
  {
    "id": "35847388",
    "name": "Hello",
    "artist": ["Adele"],
    "album": "25",
    "pic_id": "1407374890649284",
    "url_id": "35847388",
    "lyric_id": "35847388",
    "source": "netease"
  }
]
```

> **关键字段说明：**
> - `id` — 歌曲唯一标识
> - `url_id` — 用于获取播放链接的 ID
> - `lyric_id` — 用于获取歌词的 ID
> - `pic_id` — 用于获取封面的 ID
> - `source` — 来源平台标识

### 统一响应格式

**成功响应：**
```json
{
  "success": true,
  "platform": "netease",
  "keyword": "周杰伦",
  "page": 1,
  "count": 10,
  "data": [...],
  "timestamp": "2026-04-16T01:30:00.000Z"
}
```

**错误响应：**
```json
{
  "success": false,
  "code": 502,
  "message": "Search failed on netease",
  "details": "...",
  "timestamp": "2026-04-16T01:30:00.000Z"
}
```

**限流响应 (HTTP 429)：**
```json
{
  "success": false,
  "code": 429,
  "message": "Too Many Requests",
  "details": "Retry after 15 seconds"
}
```

---

## 🔒 八、安全建议

1. **生产环境务必开启 HTTPS** — 在宝塔面板申请免费 SSL 证书（Let's Encrypt）
2. **限制 CORS 来源** — 将 `corsOrigins` 从 `*` 改为具体域名如 `https://your-domain.com`
3. **防火墙只开放必要端口** — 只开放 80/443，内部转发到 3300
4. **定期更新依赖** — `npm update @meting/core`
5. **监控日志** — `pm2 logs meting-api --lines 100`
6. **Cookie 安全** — 不要把包含敏感信息的 Cookie 提交到公开仓库

---

## ❓ 九、常见问题

**Q: 搜索不到歌曲？**
A: 各平台搜索算法不同，尝试切换其他平台。部分新歌可能有索引延迟。

**Q: 获取 URL 返回空？(403 Empty URL)**
A: 版权保护或 VIP 歌曲。解决方法：
1. 配置对应平台的 Cookie（见第四节「Cookie 配置」）
2. 尝试其他平台搜索同一首歌

**Q: 触发 429 Too Many Requests？**
A: 默认每分钟 120 次限制。可在 CONFIG.rateLimit.maxRequests 调整。

**Q: 如何支持 Bilibili？**
A: Meting 核心库暂不支持 B站。保留你现有的独立 B站 API（`BILIBILI_API`）并行使用即可。

**Q: Node.js 版本太旧？**
A: 需要 Node.js >= 12（建议 >= 16）。用 `node -v` 检查版本，升级方法见步骤 1。

**Q: PM2 重启后 Cookie 丢失？**
A: 使用 ecosystem.config.js 的 env 字段持久化配置环境变量。

---

## 📄 License

MIT © [metowolf](https://github.com/metowolf) + 自建扩展
