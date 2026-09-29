use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
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
    index: usize,
    name: String,
    width: u32,
    height: u32,
    primary: bool,
}

#[tauri::command]
fn list_displays(app: AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = app.primary_monitor().ok().flatten().map(|m| *m.position());
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, m)| DisplayInfo {
            index,
            name: m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            primary: primary_pos.map(|p| p == *m.position()).unwrap_or(index == 0),
        })
        .collect())
}

/// Opens the projector window full screen on the chosen display and returns that display's name.
/// Window creation happens in an async command to avoid a deadlock on Windows.
#[tauri::command]
async fn open_presentation(app: AppHandle, display_index: Option<usize>) -> Result<String, String> {
    if let Some(existing) = app.get_webview_window(PRESENTATION_LABEL) {
        existing.destroy().map_err(|e| e.to_string())?;
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_pos = app.primary_monitor().ok().flatten().map(|m| *m.position());
    // Default: the first display that isn't the primary one, else the primary.
    let target = display_index
        .and_then(|i| monitors.get(i))
        .or_else(|| monitors.iter().find(|m| Some(*m.position()) != primary_pos))
        .or_else(|| monitors.first())
        .ok_or("No displays found")?;

    let target_name = target
        .name()
        .cloned()
        .unwrap_or_else(|| format!("{}×{} display", target.size().width, target.size().height));
    let scale = target.scale_factor();
    let pos = target.position().to_logical::<f64>(scale);
    let size = target.size().to_logical::<f64>(scale);

    let window = WebviewWindowBuilder::new(
        &app,
        PRESENTATION_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("VerseLight Projector")
    // Presentation only: no border, title bar or taskbar entry.
    .decorations(false)
    .skip_taskbar(true)
    .resizable(false)
    .position(pos.x, pos.y)
    .inner_size(size.width, size.height)
    .focused(false)
    .disable_drag_drop_handler()
    .build()
    .map_err(|e| e.to_string())?;

    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    // Keep keyboard focus with the operator in the control window.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(target_name)
}

#[tauri::command]
fn close_presentation(app: AppHandle) -> Result<(), String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
