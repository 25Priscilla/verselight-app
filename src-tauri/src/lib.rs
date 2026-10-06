use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const PRESENTATION_LABEL: &str = "presentation";

/// Only simple file names are allowed so nothing can escape the app data folder.
fn data_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !valid {
        return Err(format!("Invalid data file name: {name}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
fn read_data(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = data_path(&app, &name)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_data(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let path = data_path(&app, &name)?;
    // Write to a temp file first so a crash mid-save can't corrupt the library.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_data(app: AppHandle, name: String) -> Result<(), String> {
    let path = data_path(&app, &name)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayInfo {
    /// Stable identity (the OS display name). List positions change when screens are plugged in or out.
    id: String,
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    primary: bool,
}

/// A monitor's identity: its OS name (e.g. `\\.\DISPLAY2` on Windows), else its desktop position.
fn monitor_id(m: &Monitor) -> String {
    m.name()
        .cloned()
        .unwrap_or_else(|| format!("{},{}", m.position().x, m.position().y))
}

#[tauri::command]
fn list_displays(app: AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = app.primary_monitor().ok().flatten().map(|m| *m.position());
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, m)| DisplayInfo {
            id: monitor_id(m),
            index,
            name: m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            primary: primary_pos.map(|p| p == *m.position()).unwrap_or(index == 0),
        })
        .collect())
}

/// Only one open or close runs at a time, so pressing Start repeatedly can never make two projector windows.
static PROJECTOR_LOCK: Mutex<()> = Mutex::new(());

/// Puts the projector window full screen on the given monitor. Uses physical pixels so it lands on the right
/// screen even when the laptop and projector use different display scaling.
fn place_on(window: &WebviewWindow, target: &Monitor) -> tauri::Result<()> {
    if window.is_fullscreen()? {
        window.set_fullscreen(false)?;
    }
    window.set_position(PhysicalPosition::new(target.position().x, target.position().y))?;
    window.set_size(PhysicalSize::new(target.size().width, target.size().height))?;
    window.set_fullscreen(true)
}

/// Opens the projector window full screen on the chosen display (by id), or moves the one already open.
/// The frontend picks the display; this re-checks it is still connected, since screens can come and go.
/// Window creation happens in an async command to avoid a deadlock on Windows.
#[tauri::command]
async fn open_presentation(app: AppHandle, display_id: Option<String>) -> Result<(), String> {
    let _guard = PROJECTOR_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let target = match &display_id {
        Some(id) => monitors
            .iter()
            .find(|m| &monitor_id(m) == id)
            .ok_or("the chosen screen isn't connected")?,
        // Automatic: never cover the operator's main screen.
        None => monitors
            .iter()
            .find(|m| Some(*m.position()) != primary_pos)
            .ok_or("no second screen is connected")?,
    };

    let window = match app.get_webview_window(PRESENTATION_LABEL) {
        // Reuse the open window: the slide it shows stays in sync, and there is never a second one.
        Some(existing) => existing,
        None => WebviewWindowBuilder::new(
            &app,
            PRESENTATION_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title("VerseLight Projector")
        // Presentation only: no border, title bar or taskbar entry.
        .decorations(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?,
    };

    let placed = place_on(&window, target).and_then(|_| window.show());
    // Never leave a full-screen window over the wrong screen (e.g. the operator's) if placing it failed.
    let landed = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| monitor_id(&m) == monitor_id(target))
        .unwrap_or(false);
    if let Err(e) = placed {
        let _ = window.destroy();
        return Err(format!("the projector window couldn't be placed on the screen ({e})"));
    }
    if !landed {
        let _ = window.destroy();
        return Err("the projector window couldn't be moved to the chosen screen".into());
    }

    // Keep keyboard focus with the operator in the control window.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(())
}

#[tauri::command]
async fn close_presentation(app: AppHandle) -> Result<(), String> {
    let _guard = PROJECTOR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(window) = app.get_webview_window(PRESENTATION_LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Shows a native save dialog and writes the text file. Returns false if cancelled.
#[tauri::command]
async fn save_file(app: AppHandle, default_name: String, contents: String) -> Result<bool, String> {
    let chosen = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("VerseLight library", &["json"])
        .blocking_save_file();
    match chosen {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            fs::write(path, contents).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// The control window opens at 1440×900 logical pixels. On a laptop with display scaling (1920×1080 at 150% is
/// only 1280×720) that is bigger than the screen: Windows trims it to the screen's size, but it is not maximized,
/// so its bottom edge (where Present Now is) sits behind the taskbar. So the window is made to fit the work area
/// (the screen above the taskbar) and then maximized. Fitting it first matters: restoring a maximized window goes
/// back to this size, and an oversized one would slip behind the taskbar again.
fn fit_to_screen(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()? else { return Ok(()) };
    let work = monitor.work_area();
    let outer = window.outer_size()?;
    if outer.width <= work.size.width && outer.height <= work.size.height {
        return Ok(());
    }
    // set_size sets the inside of the window, so leave room for the title bar and borders.
    let inner = window.inner_size()?;
    let frame_w = outer.width.saturating_sub(inner.width);
    let frame_h = outer.height.saturating_sub(inner.height);
    let width = (work.size.width * 9 / 10).min(outer.width).saturating_sub(frame_w);
    let height = (work.size.height * 9 / 10).min(outer.height).saturating_sub(frame_h);
    window.set_size(PhysicalSize::new(width, height))?;
    window.center()?;
    window.maximize()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                fit_to_screen(&main)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                let app = window.app_handle();
                match window.label() {
                    PRESENTATION_LABEL => {
                        let _ = app.emit("presentation-closed", ());
                    }
                    // Closing the control window ends the whole show.
                    "main" => {
                        if let Some(p) = app.get_webview_window(PRESENTATION_LABEL) {
                            let _ = p.destroy();
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_data,
            write_data,
            delete_data,
            list_displays,
            open_presentation,
            close_presentation,
            save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running VerseLight");
}
