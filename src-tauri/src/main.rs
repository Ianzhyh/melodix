#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_music;
use local_music::*;

use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::process::{Command, Child, Stdio};
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, PhysicalPosition, LogicalPosition, WindowEvent};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

struct SidecarPort(u16);

struct SidecarState {
    child: Mutex<Option<Child>>,
}

// 全局下载任务表：taskId -> CancellationToken
type DownloadTaskMap = Arc<Mutex<HashMap<String, CancellationToken>>>;

#[derive(serde::Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    speed: u64,
}

#[tauri::command]
fn get_sidecar_port(port: tauri::State<'_, SidecarPort>) -> u16 {
    port.0
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// 在系统默认浏览器打开外部链接（用于关于页面的跳转）
#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell().open(url, None).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct UpdateInfo {
    has_update: bool,
    latest_version: String,
    current_version: String,
    release_url: String,
    notes: String,
}

fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let v = v.trim_start_matches('v').trim_start_matches('V');
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((parts[0].parse().ok()?, parts[1].parse().ok()?, parts[2].parse().ok()?))
}

// 检查 GitHub Releases 是否有新版本
#[tauri::command]
async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let url = "https://api.github.com/repos/Ianzhyh/melodix/releases/latest";
    let client = reqwest::Client::builder()
        .user_agent("melodix-updater")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            has_update: false,
            latest_version: String::new(),
            current_version: current,
            release_url: String::new(),
            notes: "尚无发布版本".to_string(),
        });
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = json["tag_name"].as_str().unwrap_or("").to_string();
    let release_url = json["html_url"].as_str().unwrap_or("").to_string();
    let notes = json["body"].as_str().unwrap_or("").to_string();
    let latest = tag.trim_start_matches('v').trim_start_matches('V').to_string();
    let has_update = match (parse_version(&current), parse_version(&latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    };
    Ok(UpdateInfo {
        has_update,
        latest_version: latest,
        current_version: current,
        release_url,
        notes,
    })
}

#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    task_id: String,
    url: String,
    filename: String,
    download_dir: String,
    task_map: tauri::State<'_, DownloadTaskMap>,
) -> Result<String, String> {
    // Security Check 1: Enforce .mp3 or .flac extension
    if !filename.to_lowercase().ends_with(".mp3") && !filename.to_lowercase().ends_with(".flac") {
        return Err("Only .mp3 and .flac files are allowed for security reasons".to_string());
    }

    // Security Check 2: Prevent path traversal in filename
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Filename cannot contain path separators".to_string());
    }

    let download = std::path::Path::new(&download_dir);
    let canonical_download = download.canonicalize()
        .map_err(|e| format!("Invalid download directory: {}", e))?;

    let dest = canonical_download.join(&filename);

    if !dest.starts_with(&canonical_download) {
        return Err("Destination path is outside the download directory".to_string());
    }

    // 注册取消令牌到全局任务表
    let task_map_inner: DownloadTaskMap = task_map.inner().clone();
    let cancel_token = CancellationToken::new();
    {
        let mut map = task_map_inner.lock()
            .map_err(|e| format!("Lock task map failed: {}", e))?;
        map.insert(task_id.clone(), cancel_token.clone());
    }

    let event_name = format!("download-progress-{}", task_id);

    // 退出路径清理：从任务表移除
    let cleanup = || {
        if let Ok(mut map) = task_map_inner.lock() {
            map.remove(&task_id);
        }
    };

    let response = match reqwest::get(&url).await {
        Ok(r) => r,
        Err(e) => {
            cleanup();
            return Err(format!("Request failed: {}", e));
        }
    };

    if !response.status().is_success() && !response.status().is_redirection() {
        cleanup();
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total: u64 = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // 根据实际 Content-Type 修正文件扩展名（前端可能硬编码 .mp3，但 sidecar 返回 FLAC）
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let actual_filename = if content_type.contains("flac") && filename.to_lowercase().ends_with(".mp3") {
        let stem = filename.trim_end_matches(".mp3").trim_end_matches(".MP3");
        format!("{}.flac", stem)
    } else if (content_type.contains("mpeg") || content_type.contains("mp3")) && filename.to_lowercase().ends_with(".flac") {
        let stem = filename.trim_end_matches(".flac").trim_end_matches(".FLAC");
        format!("{}.mp3", stem)
    } else {
        filename.clone()
    };
    let dest = canonical_download.join(&actual_filename);

    let mut stream = response.bytes_stream();

    let mut file = match tokio::fs::File::create(&dest).await {
        Ok(f) => f,
        Err(e) => {
            cleanup();
            return Err(format!("Create file failed: {}", e));
        }
    };

    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut last_downloaded: u64 = 0;

    loop {
        // 检查取消
        if cancel_token.is_cancelled() {
            drop(file);
            let _ = tokio::fs::remove_file(&dest).await;
            cleanup();
            return Err("canceled".into());
        }

        match stream.next().await {
            Some(Ok(chunk)) => {
                if let Err(e) = file.write_all(&chunk).await {
                    cleanup();
                    return Err(format!("Write file failed: {}", e));
                }
                downloaded += chunk.len() as u64;

                // 每秒上报一次进度
                let now = Instant::now();
                if now.duration_since(last_emit) >= Duration::from_secs(1) {
                    let speed = downloaded.saturating_sub(last_downloaded);
                    // 兜底：上游 content-length 可能不准，若已下载量超过 total 则修正
                    let effective_total = if total > 0 && downloaded > total { downloaded } else { total };
                    let _ = app.emit(&event_name, &DownloadProgress {
                        downloaded,
                        total: effective_total,
                        speed,
                    });
                    last_emit = now;
                    last_downloaded = downloaded;
                }
            }
            Some(Err(e)) => {
                cleanup();
                return Err(format!("Stream read failed: {}", e));
            }
            None => {
                break;
            }
        }
    }

    if let Err(e) = file.flush().await {
        cleanup();
        return Err(format!("Flush file failed: {}", e));
    }

    cleanup();

    // 下发最终进度（100%）— 用实际下载量作为 total，避免上游 content-length 不准
    let _ = app.emit(&event_name, &DownloadProgress {
        downloaded,
        total: downloaded,
        speed: 0,
    });

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
async fn cancel_download(
    task_id: String,
    task_map: tauri::State<'_, DownloadTaskMap>,
) -> Result<(), String> {
    let token = {
        let mut map = task_map.lock().map_err(|e| format!("Lock task map failed: {}", e))?;
        map.remove(&task_id)
    };
    if let Some(token) = token {
        token.cancel();
        Ok(())
    } else {
        Err(format!("Task {} not found", task_id))
    }
}

// 扫描本地音乐目录：递归扫描并导入所有支持的音频文件
#[tauri::command]
async fn scan_local_music(app: AppHandle, dir: String) -> Result<ScanResult, String> {
    let db = app.state::<DbState>().inner().clone();
    let dir_path = std::path::PathBuf::from(&dir);
    let app_clone = app.clone();
    // 扫描是同步耗时操作，用 spawn_blocking 避免阻塞 tokio runtime
    tokio::task::spawn_blocking(move || scan_directory(&db, &dir_path, &app_clone))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

// 查询本地歌曲列表，转为前端 Song 格式
#[tauri::command]
fn get_local_songs(
    db: tauri::State<'_, DbState>,
    offset: i64,
    limit: i64,
    search: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let records = get_songs(db.inner(), offset, limit, search.as_deref())
        .map_err(|e| e.to_string())?;

    // 映射为前端 Song 格式
    let result = records
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id.to_string(),
                "name": r.title,
                "artist": r.artist.clone().unwrap_or_default(),
                "album": r.album.clone().unwrap_or_default(),
                "cover": r.cover_path.clone().unwrap_or_default(),
                "filePath": r.file_path,
                "format": r.format.clone().unwrap_or_default(),
                "duration": r.duration.unwrap_or(0),
                "source": "local",
                "isLocal": true,
                "lyrics": r.lyrics.clone(),
                "onlineSource": r.online_source.clone(),
            })
        })
        .collect();

    Ok(result)
}

// 获取本地歌曲总数
#[tauri::command]
fn get_local_song_count(db: tauri::State<'_, DbState>) -> Result<i64, String> {
    get_song_count(db.inner()).map_err(|e| e.to_string())
}

// 删除指定 id 的本地歌曲
#[tauri::command]
fn delete_local_song(db: tauri::State<'_, DbState>, id: i64) -> Result<(), String> {
    delete_song(db.inner(), id).map_err(|e| e.to_string())
}

// 导入指定文件列表
#[tauri::command]
async fn import_files(
    app: AppHandle,
    db: tauri::State<'_, DbState>,
    file_paths: Vec<String>,
) -> Result<ScanResult, String> {
    let covers_dir = get_covers_dir(&app).map_err(|e| e.to_string())?;
    let db = db.inner().clone();

    let mut scanned = 0u32;
    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut failed = 0u32;
    let total = file_paths.len() as u32;

    for path_str in &file_paths {
        scanned += 1;
        // 上报导入进度
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                scanned,
                total,
                current_file: path_str.clone(),
            },
        );

        let path = std::path::Path::new(path_str);
        match import_single_file(&db, path, &covers_dir) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
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

// 监控下载目录：停止旧 watcher，启动新 watcher
#[tauri::command]
fn watch_download_dir(
    app: AppHandle,
    db: tauri::State<'_, DbState>,
    watcher: tauri::State<'_, WatcherState>,
    dir: String,
) -> Result<(), String> {
    // 停止旧 watcher（drop 即停止监控）
    {
        let mut w = watcher.lock().map_err(|e| e.to_string())?;
        *w = None;
    }

    // 启动新 watcher
    let dir_path = std::path::PathBuf::from(&dir);
    let new_state = start_watcher(app, dir_path, db.inner().clone()).map_err(|e| e.to_string())?;

    // 从返回的 WatcherState 取出 watcher，存入现有 state
    let watcher_inner = new_state
        .lock()
        .map_err(|e| e.to_string())?
        .take();
    {
        let mut w = watcher.lock().map_err(|e| e.to_string())?;
        *w = watcher_inner;
    }

    Ok(())
}

// 停止文件监控
#[tauri::command]
fn stop_watch(watcher: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let mut w = watcher.lock().map_err(|e| e.to_string())?;
    *w = None;
    Ok(())
}

// 在线补齐单首本地歌曲的封面和歌词
// 调用 sidecar 搜索匹配，下载封面、获取歌词并持久化到数据库
#[tauri::command]
async fn enrich_local_song(
    db: tauri::State<'_, DbState>,
    port: tauri::State<'_, SidecarPort>,
    app: tauri::AppHandle,
    id: i64,
    cookie: String,
) -> Result<serde_json::Value, String> {
    let sidecar_port = port.0;
    let covers_dir = get_covers_dir(&app).map_err(|e| e.to_string())?;
    let db = db.inner().clone();

    // enrich_song 是同步阻塞的（reqwest::blocking），用 spawn_blocking 避免阻塞 tokio runtime
    let result = tokio::task::spawn_blocking(move || {
        enrich_song(&db, id, sidecar_port, &covers_dir, &cookie)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e.to_string())?;

    // 通知前端刷新
    let _ = app.emit("local-music-updated", ());

    serde_json::to_value(&result).map_err(|e| e.to_string())
}

// 批量在线补齐所有需要补齐的本地歌曲
// 查询 cover_path 或 lyrics 为空的歌曲，逐个补齐，上报进度
#[tauri::command]
async fn enrich_all_local_songs(
    db: tauri::State<'_, DbState>,
    port: tauri::State<'_, SidecarPort>,
    app: tauri::AppHandle,
    cookie: String,
) -> Result<serde_json::Value, String> {
    let sidecar_port = port.0;
    let covers_dir = get_covers_dir(&app).map_err(|e| e.to_string())?;
    let db = db.inner().clone();

    // 查询需要补齐的歌曲列表
    let songs = {
        let db_ref = db.clone();
        tokio::task::spawn_blocking(move || get_songs_needing_enrich(&db_ref))
            .await
            .map_err(|e| format!("任务执行失败: {}", e))?
            .map_err(|e| e.to_string())?
    };

    let total = songs.len();
    let mut enriched = 0;
    let mut failed = 0;
    let mut current = 0;

    for (id, title, artist) in songs {
        current += 1;

        // 上报进度
        let _ = app.emit(
            "enrich-progress",
            serde_json::json!({
                "current": current,
                "total": total,
                "currentSong": format!("{} - {}", title, artist),
            }),
        );

        let db_clone = db.clone();
        let covers_clone = covers_dir.clone();
        let cookie_clone = cookie.clone();
        let result = tokio::task::spawn_blocking(move || {
            enrich_song(&db_clone, id, sidecar_port, &covers_clone, &cookie_clone)
        })
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?
        .map_err(|e| e.to_string())?;

        if result.matched && (result.cover_updated || result.lyrics_updated) {
            enriched += 1;
        } else {
            failed += 1;
        }
    }

    // 通知前端刷新
    let _ = app.emit("local-music-updated", ());

    Ok(serde_json::json!({
        "total": total,
        "enriched": enriched,
        "failed": failed,
    }))
}

fn find_free_port(start: u16) -> Option<u16> {
    let mut port = start;
    while port < 65535 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Some(port);
        }
        port += 1;
    }
    None
}

fn main() {
    let port = match find_free_port(3000) {
        Some(p) => p,
        None => {
            eprintln!("FATAL: No free port available between 3000-65534. Please close other applications and try again.");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarPort(port))
        .manage(DownloadTaskMap::default())
        .setup(move |app| {
            let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_skip_taskbar(false);
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Position the window near the tray icon
                                let scale_factor = window.scale_factor().unwrap_or(1.0);
                                let (tray_x, tray_y) = match rect.position {
                                    tauri::Position::Physical(p) => (p.x as f64 / scale_factor, p.y as f64 / scale_factor),
                                    tauri::Position::Logical(p) => (p.x, p.y),
                                };
                                let window_width = 280.0;
                                let window_height = 290.0;
                                let _ = window.set_position(LogicalPosition::new(tray_x - (window_width / 2.0), tray_y - window_height - 10.0));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Create tray window
            let tray_window = WebviewWindowBuilder::new(app, "tray", WebviewUrl::App("tray.html".into()))
                .title("Tray Menu")
                .inner_size(280.0, 290.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .build()?;

            let tray_window_clone = tray_window.clone();
            tray_window.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = tray_window_clone.hide();
                }
            });

            // Get main window for vibrancy
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    use window_vibrancy::{apply_blur, apply_acrylic};
                    // Use Acrylic with a very light alpha (20) so it's highly transparent but nicely frosted (blurred).
                    if let Err(err) = apply_acrylic(&window, Some((15, 23, 42, 20))) {
                        eprintln!("Failed to apply Acrylic, falling back to blur: {:?}", err);
                        let _ = apply_blur(&window, Some((15, 23, 42, 20)));
                    }
                }
            }
            
            // Get tray window for vibrancy
            if let Some(window) = app.get_webview_window("tray") {
                #[cfg(target_os = "windows")]
                {
                    use window_vibrancy::{apply_blur, apply_acrylic};
                    if let Err(err) = apply_acrylic(&window, Some((15, 23, 42, 60))) {
                        let _ = apply_blur(&window, Some((15, 23, 42, 60)));
                    }
                }
            }

            // Spawn meting-api
            let (cmd, args, work_dir) = if cfg!(debug_assertions) {
                // Dev: use source binaries directly (resource_dir points to target/debug which is incomplete)
                let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
                    .unwrap_or_else(|_| ".".to_string());
                let meting_dir = std::path::Path::new(&manifest_dir).join("binaries").join("meting-api");
                let server_js = meting_dir.join("server.js");
                let server_str = server_js.to_str().unwrap_or("server.js").to_string();
                let work_str = meting_dir.to_str().unwrap_or(".").to_string();
                println!("[Tauri] Starting meting-api (dev): node {} (PORT={})", server_str, port);
                ("node".to_string(), vec![server_str], Some(work_str))
            } else {
                // Production: use bundled node.exe + meting-api from resource dir
                let resource_dir = match app.path().resource_dir() {
                    Ok(dir) => dir,
                    Err(e) => {
                        eprintln!("FATAL: Cannot access resource directory: {}. Application may not be installed correctly.", e);
                        std::process::exit(1);
                    }
                };
                let node_exe = resource_dir.join("binaries").join("node.exe");
                let meting_dir = resource_dir.join("binaries").join("meting-api");
                let server_js = meting_dir.join("server.js");
                let node_str = node_exe.to_str().unwrap_or("node.exe").to_string();
                let server_str = server_js.to_str().unwrap_or("server.js").to_string();
                let work_str = meting_dir.to_str().unwrap_or(".").to_string();
                println!("[Tauri] Starting meting-api (prod): {} {} (PORT={})", node_str, server_str, port);
                (node_str, vec![server_str], Some(work_str))
            };

            let app_data_dir = app.path().app_local_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_data_dir).ok();

            let mut cmd_builder = Command::new(&cmd);
            cmd_builder
                .args(&args)
                .env("PORT", port.to_string())
                .env("USER_DATA_PATH", app_data_dir.to_str().unwrap_or("."))
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            if let Some(dir) = work_dir {
                cmd_builder.current_dir(dir);
            }

            // On Windows, hide the console window of the child process
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                // CREATE_NO_WINDOW flag = 0x08000000
                cmd_builder.creation_flags(0x08000000);
            }

            let mut child = match cmd_builder.spawn() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("FATAL: Failed to start sidecar service (meting-api): {}", e);
                    std::process::exit(1);
                }
            };

            println!("[Tauri] Meting-api spawned on port {}", port);

            // 消费子进程 stdout/stderr 防止管道阻塞
            if let Some(stdout) = child.stdout.take() {
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut buf = [0u8; 4096];
                    let mut reader = std::io::BufReader::new(stdout);
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => { let _ = &buf[..n]; }
                        }
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                std::thread::spawn(move || {
                    use std::io::Read;
                    let mut buf = [0u8; 4096];
                    let mut reader = std::io::BufReader::new(stderr);
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => { let _ = &buf[..n]; }
                        }
                    }
                });
            }

            // Store child in app state
            app.manage(SidecarState {
                child: Mutex::new(Some(child)),
            });

            // 初始化本地音乐数据库
            let db = local_music::init_db(app.handle())?;
            app.manage(db);

            // 初始化文件监控状态（初始为 None，由 watch_download_dir 命令启动）
            let watcher_state: local_music::WatcherState = Arc::new(Mutex::new(None));
            app.manage(watcher_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            open_external_url,
            check_for_update,
            download_file,
            cancel_download,
            scan_local_music,
            get_local_songs,
            get_local_song_count,
            delete_local_song,
            import_files,
            watch_download_dir,
            stop_watch,
            enrich_local_song,
            enrich_all_local_songs,
            exit_app
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("FATAL: Failed to initialize Tauri application: {}", e);
            std::process::exit(1);
        })
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Terminate meting-api
                let state = app_handle.state::<SidecarState>();
                if let Ok(mut lock) = state.child.lock() {
                    if let Some(mut child) = lock.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                        println!("[Tauri] Meting-api process killed on exit");
                    }
                };
            }
        });
}
