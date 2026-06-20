// 本地音乐导入系统后端实现
// 提供数据库管理、元数据解析、目录扫描、单文件导入、查询、文件监控等功能

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::read_from_path;
use lofty::tag::Accessor;

// 数据库状态类型别名：用 std::sync::Mutex 包装 Connection
pub type DbState = Arc<Mutex<Connection>>;
// 文件监控状态类型别名
pub type WatcherState = Arc<Mutex<Option<RecommendedWatcher>>>;

// 支持的音频格式扩展名
const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "aac", "m4a", "ogg"];

// 元数据解析结果（内部使用）
struct LocalSong {
    file_path: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    cover_path: Option<String>,
    duration: Option<i64>,
    bitrate: Option<i64>,
    format: String,
    file_size: Option<i64>,
}

// 数据库记录（查询返回，序列化给前端）
#[derive(Serialize)]
pub struct LocalSongRecord {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_path: Option<String>,
    pub duration: Option<i64>,
    pub bitrate: Option<i64>,
    pub format: Option<String>,
    pub file_size: Option<i64>,
    pub created_at: i64,
    pub lyrics: Option<String>,
    pub online_source: Option<String>,
}

// 扫描结果统计
#[derive(Serialize)]
pub struct ScanResult {
    pub scanned: u32,
    pub imported: u32,
    pub skipped: u32,
    pub failed: u32,
}

// 扫描进度（通过事件上报前端）
#[derive(Serialize, Clone)]
pub struct ScanProgress {
    pub scanned: u32,
    pub total: u32,
    pub current_file: String,
}

// 在线补齐结果
#[derive(Serialize)]
pub struct EnrichResult {
    pub cover_updated: bool,
    pub lyrics_updated: bool,
    pub matched: bool,
}

// 判断文件是否为支持的音频格式
fn is_supported_format(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()),
        None => false,
    }
}

// 获取 covers 目录路径（app local data dir/covers），不存在则创建
pub fn get_covers_dir(app: &AppHandle) -> Result<PathBuf> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| anyhow!("获取 app local data dir 失败: {}", e))?;
    let covers_dir = data_dir.join("covers");
    std::fs::create_dir_all(&covers_dir)?;
    Ok(covers_dir)
}

// 初始化数据库：在 app_local_data_dir 下创建 melodix-local.db 并建表
pub fn init_db(app: &AppHandle) -> Result<DbState> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| anyhow!("获取 app local data dir 失败: {}", e))?;
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("melodix-local.db");

    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS local_music (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            cover_path TEXT,
            duration INTEGER,
            bitrate INTEGER,
            format TEXT,
            file_size INTEGER,
            created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_local_music_title ON local_music(title);
        CREATE INDEX IF NOT EXISTS idx_local_music_artist ON local_music(artist);",
    )?;

    // 数据库迁移：为已有库追加新列（列已存在时忽略错误）
    // lyrics 存 LRC 文本，online_source 记录补齐来源（netease 等），online_song_id 记录匹配的在线歌曲 id
    let _ = conn.execute("ALTER TABLE local_music ADD COLUMN lyrics TEXT", []);
    let _ = conn.execute("ALTER TABLE local_music ADD COLUMN online_source TEXT", []);
    let _ = conn.execute("ALTER TABLE local_music ADD COLUMN online_song_id TEXT", []);

    Ok(Arc::new(Mutex::new(conn)))
}

// 解析单个文件的元数据
// 用 lofty 读取标签和属性，封面提取到 covers 目录
fn parse_file_metadata(file_path: &Path, covers_dir: &Path) -> Result<LocalSong> {
    // 文件大小
    let file_size = std::fs::metadata(file_path).ok().map(|m| m.len() as i64);

    // 格式（扩展名小写）
    let format = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    // 读取元数据（失败则返回 Err，调用方处理跳过）
    let tagged_file = read_from_path(file_path)?;
    let properties = tagged_file.properties();

    // 时长（秒）和比特率
    let duration = Some(properties.duration().as_secs() as i64);
    let bitrate = properties.audio_bitrate().map(|b| b as i64);

    // 从标签提取信息
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let (title, artist, album, cover_path) = if let Some(tag) = tag {
        // title 缺失则用文件名（去扩展名）
        let title = tag
            .title()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });
        let artist = tag.artist().map(|s| s.to_string());
        let album = tag.album().map(|s| s.to_string());
        // 封面提取
        let cover_path = extract_cover(tag.pictures(), file_path, covers_dir);
        (title, artist, album, cover_path)
    } else {
        // 无标签，title 用文件名
        let title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
        (title, None, None, None)
    };

    Ok(LocalSong {
        file_path: file_path.to_string_lossy().to_string(),
        title,
        artist,
        album,
        cover_path,
        duration,
        bitrate,
        format,
        file_size,
    })
}

// 提取封面图片到临时文件（用文件路径的 hash 命名）
fn extract_cover(
    pictures: &[lofty::picture::Picture],
    file_path: &Path,
    covers_dir: &Path,
) -> Option<String> {
    if pictures.is_empty() {
        return None;
    }
    let pic = &pictures[0];

    // 用文件路径的 hash 命名，避免冲突
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    let hash = hasher.finish();

    // 封面统一用 .jpg 扩展名（大多数嵌入封面为 JPEG，扩展名不影响图片实际读取）
    let cover_name = format!("{}.jpg", hash);
    let cover_path = covers_dir.join(cover_name);

    // 封面文件已存在则直接返回路径
    if cover_path.exists() {
        return Some(cover_path.to_string_lossy().to_string());
    }

    // 写入封面文件
    match std::fs::write(&cover_path, pic.data()) {
        Ok(_) => Some(cover_path.to_string_lossy().to_string()),
        Err(_) => None,
    }
}

// 插入或忽略单首歌（file_path 唯一），返回 true 表示新导入，false 表示已存在
fn insert_song(conn: &Connection, song: &LocalSong) -> Result<bool> {
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs() as i64;

    let affected = conn.execute(
        "INSERT OR IGNORE INTO local_music
         (file_path, title, artist, album, cover_path, duration, bitrate, format, file_size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            song.file_path,
            song.title,
            song.artist,
            song.album,
            song.cover_path,
            song.duration,
            song.bitrate,
            song.format,
            song.file_size,
            created_at,
        ],
    )?;

    Ok(affected > 0)
}

// 递归收集目录下所有支持格式的文件路径
fn collect_audio_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    if !dir.is_dir() {
        return Err(anyhow!("不是目录: {}", dir.display()));
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_audio_files(&path, files)?;
        } else if is_supported_format(&path) {
            files.push(path);
        }
    }

    Ok(())
}

// 扫描目录：递归遍历，逐个解析元数据并入库，通过事件上报进度
pub fn scan_directory(db: &DbState, dir: &Path, app: &AppHandle) -> Result<ScanResult> {
    let covers_dir = get_covers_dir(app)?;

    // 递归收集所有支持格式的文件路径
    let mut files: Vec<PathBuf> = Vec::new();
    collect_audio_files(dir, &mut files)?;

    let total = files.len() as u32;
    let mut scanned = 0u32;
    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut failed = 0u32;

    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;

    for file_path in &files {
        scanned += 1;
        let current_file = file_path.to_string_lossy().to_string();

        // 上报扫描进度
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                scanned,
                total,
                current_file: current_file.clone(),
            },
        );

        match parse_file_metadata(file_path, &covers_dir) {
            Ok(song) => match insert_song(&conn, &song) {
                Ok(true) => imported += 1,
                Ok(false) => skipped += 1,
                Err(_) => failed += 1,
            },
            Err(_) => failed += 1,
        }
    }

    Ok(ScanResult {
        scanned,
        imported,
        skipped,
        failed,
    })
}

// 单文件导入：解析元数据并 INSERT OR IGNORE 入库
// 返回 true 表示新导入，false 表示已存在跳过
pub fn import_single_file(db: &DbState, file_path: &Path, covers_dir: &Path) -> Result<bool> {
    let song = parse_file_metadata(file_path, covers_dir)?;
    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
    insert_song(&conn, &song)
}

// 查询歌曲列表
// search 为 Some 时按 title/artist/album 模糊匹配，按 created_at DESC 排序，分页返回
pub fn get_songs(
    db: &DbState,
    offset: i64,
    limit: i64,
    search: Option<&str>,
) -> Result<Vec<LocalSongRecord>> {
    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;

    let mut records = Vec::new();

    // 行映射闭包：把数据库行转为 LocalSongRecord
    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<LocalSongRecord> {
        Ok(LocalSongRecord {
            id: row.get(0)?,
            file_path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            cover_path: row.get(5)?,
            duration: row.get(6)?,
            bitrate: row.get(7)?,
            format: row.get(8)?,
            file_size: row.get(9)?,
            created_at: row.get(10)?,
            lyrics: row.get(11)?,
            online_source: row.get(12)?,
        })
    };

    if let Some(search) = search {
        let pattern = format!("%{}%", search);
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, cover_path, duration, bitrate, format, file_size, created_at, lyrics, online_source
             FROM local_music
             WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1
             ORDER BY created_at DESC
             LIMIT ?2 OFFSET ?3",
        )?;
        let rows = stmt.query_map(rusqlite::params![pattern, limit, offset], map_row)?;
        for row in rows {
            records.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, cover_path, duration, bitrate, format, file_size, created_at, lyrics, online_source
             FROM local_music
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit, offset], map_row)?;
        for row in rows {
            records.push(row?);
        }
    }

    Ok(records)
}

// 获取歌曲总数
pub fn get_song_count(db: &DbState) -> Result<i64> {
    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM local_music", [], |row| row.get(0))?;
    Ok(count)
}

// 删除指定 id 的歌曲
pub fn delete_song(db: &DbState, id: i64) -> Result<()> {
    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
    conn.execute("DELETE FROM local_music WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

// 启动文件监控：监控 Create 事件，检测到新音频文件后延迟 2 秒导入
pub fn start_watcher(app: AppHandle, dir: PathBuf, db: DbState) -> Result<WatcherState> {
    let covers_dir = get_covers_dir(&app)?;

    let app_clone = app.clone();
    let db_clone = db.clone();

    // 创建 watcher，回调处理 Create 事件
    let mut watcher = notify::recommended_watcher(
        move |res: std::result::Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // 只处理 Create 事件
                if let EventKind::Create(_) = event.kind {
                    for path in &event.paths {
                        if is_supported_format(path) {
                            let app = app_clone.clone();
                            let db = db_clone.clone();
                            let path = path.clone();
                            let covers = covers_dir.clone();
                            // spawn tokio task 延迟 2 秒后导入（等文件写入完成）
                            let _ = tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                                match import_single_file(&db, &path, &covers) {
                                    Ok(true) => {
                                        // 新导入成功，通知前端刷新
                                        let _ = app.emit("local-music-updated", ());
                                    }
                                    _ => {}
                                }
                            });
                        }
                    }
                }
            }
        },
    )?;

    // 递归监控目录
    watcher.watch(&dir, RecursiveMode::Recursive)?;

    Ok(Arc::new(Mutex::new(Some(watcher))))
}

// 查询所有需要补齐的歌曲（cover_path 为空或 lyrics 为空）
// 返回 (id, title, artist) 列表，供批量补齐使用
pub fn get_songs_needing_enrich(db: &DbState) -> Result<Vec<(i64, String, String)>> {
    let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
    let mut stmt = conn.prepare(
        "SELECT id, title, artist FROM local_music WHERE cover_path IS NULL OR lyrics IS NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let title: String = row.get(1)?;
        let artist: Option<String> = row.get(2)?;
        Ok((id, title, artist.unwrap_or_default()))
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

// 在线补齐单首歌的封面和歌词
// 调用 sidecar 搜索 API 匹配最相似的歌曲，下载封面、获取歌词并持久化到数据库
// 任何子步骤失败都不中断，返回已成功完成的部分
pub fn enrich_song(
    db: &DbState,
    song_id: i64,
    sidecar_port: u16,
    covers_dir: &Path,
    tencent_cookie: &str, // QQ 音乐 Cookie（仅歌词需要）
) -> Result<EnrichResult> {
    // 1. 查询该歌曲的 title、artist、cover_path、lyrics
    let (title, artist, cover_path, lyrics) = {
        let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
        conn.query_row(
            "SELECT title, artist, cover_path, lyrics FROM local_music WHERE id = ?1",
            rusqlite::params![song_id],
            |row| {
                let title: String = row.get(0)?;
                let artist: Option<String> = row.get(1)?;
                let cover_path: Option<String> = row.get(2)?;
                let lyrics: Option<String> = row.get(3)?;
                Ok((title, artist, cover_path, lyrics))
            },
        )?
    };

    let artist_str = artist.unwrap_or_default();
    let has_cover = cover_path.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
    let has_lyrics = lyrics.as_ref().map(|s| !s.is_empty()).unwrap_or(false);

    // 2. 封面和歌词都已存在，无需补齐
    if has_cover && has_lyrics {
        return Ok(EnrichResult {
            cover_updated: false,
            lyrics_updated: false,
            matched: false,
        });
    }

    // 3. 调用 sidecar 搜索 API（QQ 音乐）
    // 搜索关键词用 title + " " + artist，URL 中空格用 + 号
    let keyword = format!("{} {}", title, artist_str).trim().to_string();
    let search_keyword = keyword.replace(' ', "+");
    let search_url = format!(
        "http://127.0.0.1:{}/tencent/search?id={}&page=1&limit=5",
        sidecar_port, search_keyword
    );

    let search_resp = match reqwest::blocking::get(&search_url) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[enrich] 搜索请求失败 song_id={}: {}", song_id, e);
            return Ok(EnrichResult {
                cover_updated: false,
                lyrics_updated: false,
                matched: false,
            });
        }
    };

    let search_json: serde_json::Value = match search_resp.json() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[enrich] 搜索响应解析失败 song_id={}: {}", song_id, e);
            return Ok(EnrichResult {
                cover_updated: false,
                lyrics_updated: false,
                matched: false,
            });
        }
    };

    // 提取 data 数组
    let data_array = match search_json.get("data").and_then(|v| v.as_array()) {
        Some(arr) if !arr.is_empty() => arr,
        _ => {
            return Ok(EnrichResult {
                cover_updated: false,
                lyrics_updated: false,
                matched: false,
            });
        }
    };

    // 4. 匹配最相似的歌曲
    // 优先完全相等（忽略大小写），其次包含关系
    let title_lower = title.to_lowercase();
    let matched = data_array.iter().find(|item| {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let name_lower = name.to_lowercase();
        name_lower == title_lower
    }).or_else(|| {
        data_array.iter().find(|item| {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let name_lower = name.to_lowercase();
            name_lower.contains(&title_lower) || title_lower.contains(&name_lower)
        })
    });

    let matched = match matched {
        Some(m) => m,
        None => {
            return Ok(EnrichResult {
                cover_updated: false,
                lyrics_updated: false,
                matched: false,
            });
        }
    };

    // 获取匹配歌曲的在线 id（转字符串存储）
    let online_song_id = matched
        .get("id")
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
        .unwrap_or_default();

    // 获取 lyric_id（QQ 音乐 songmid，用于请求歌词）
    let lyric_id = matched
        .get("lyric_id")
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
        .unwrap_or_else(|| online_song_id.clone());

    let mut cover_updated = false;
    let mut lyrics_updated = false;

    // 5. 补齐封面
    if !has_cover {
        // 优先用 picId，其次用 cover 直链
        let pic_id = matched
            .get("picId")
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .or_else(|| {
                matched
                    .get("pic_id")
                    .and_then(|v| {
                        v.as_str()
                            .map(|s| s.to_string())
                            .or_else(|| v.as_i64().map(|n| n.to_string()))
                    })
            });

        let cover_url = matched
            .get("cover")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let image_bytes = if let Some(ref pic_id) = pic_id {
            // 用 picId 调用 /pic 端点（QQ 音乐）
            let url = format!(
                "http://127.0.0.1:{}/pic?server=tencent&id={}&size=500",
                sidecar_port, pic_id
            );
            fetch_image_bytes(&url)
        } else if let Some(ref cover_url) = cover_url {
            // 用 cover 直链调用 /proxy-image 端点
            let url = format!(
                "http://127.0.0.1:{}/proxy-image?url={}",
                sidecar_port, cover_url
            );
            fetch_image_bytes(&url)
        } else {
            None
        };

        if let Some(bytes) = image_bytes {
            // 保存到 covers_dir/{song_id}.jpg
            let cover_name = format!("{}.jpg", song_id);
            let cover_path = covers_dir.join(cover_name);
            if std::fs::write(&cover_path, &bytes).is_ok() {
                let path_str = cover_path.to_string_lossy().to_string();
                // 更新数据库
                let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
                let _ = conn.execute(
                    "UPDATE local_music SET cover_path = ?1 WHERE id = ?2",
                    rusqlite::params![path_str, song_id],
                );
                cover_updated = true;
            }
        }
    }

    // 6. 补齐歌词（QQ 音乐 QRC，需要 Cookie）
    if !has_lyrics && !lyric_id.is_empty() && !tencent_cookie.is_empty() {
        let lyric_url = format!(
            "http://127.0.0.1:{}/tencent/lyric-raw?id={}&songmid={}",
            sidecar_port, lyric_id, lyric_id
        );

        // QQ 音乐歌词需要 X-Tencent-Cookie 头
        let client = reqwest::blocking::Client::new();
        let lyric_text = match client
            .get(&lyric_url)
            .header("X-Tencent-Cookie", tencent_cookie)
            .send()
        {
            Ok(r) => match r.json::<serde_json::Value>() {
                Ok(v) => {
                    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
                        // 存储 QRC JSON 字符串（包含 lyrics 数组和 trans）
                        Some(v.to_string())
                    } else {
                        None
                    }
                }
                Err(e) => {
                    eprintln!("[enrich] 歌词响应解析失败 song_id={}: {}", song_id, e);
                    None
                }
            },
            Err(e) => {
                eprintln!("[enrich] 歌词请求失败 song_id={}: {}", song_id, e);
                None
            }
        };

        if let Some(text) = lyric_text {
            if !text.is_empty() {
                let conn = db.lock().map_err(|e| anyhow!("锁数据库失败: {}", e))?;
                let _ = conn.execute(
                    "UPDATE local_music SET lyrics = ?1, online_source = ?2, online_song_id = ?3 WHERE id = ?4",
                    rusqlite::params![text, "tencent", lyric_id, song_id],
                );
                lyrics_updated = true;
            }
        }
    }

    Ok(EnrichResult {
        cover_updated,
        lyrics_updated,
        matched: true,
    })
}

// 辅助函数：下载图片二进制数据
fn fetch_image_bytes(url: &str) -> Option<Vec<u8>> {
    match reqwest::blocking::get(url) {
        Ok(r) => {
            if !r.status().is_success() {
                eprintln!("[enrich] 图片下载失败 status={}", r.status());
                return None;
            }
            match r.bytes() {
                Ok(b) => Some(b.to_vec()),
                Err(e) => {
                    eprintln!("[enrich] 图片下载读取失败: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            eprintln!("[enrich] 图片下载请求失败: {}", e);
            None
        }
    }
}
