//! Bounded native-process document ingestion, Linux desktop only.
use tauri::AppHandle;

#[tauri::command]
pub async fn ingest_document_native(app: AppHandle, kind: String, content_base64: String) -> Result<String,String> {
    #[cfg(target_os = "linux")]
    { tauri::async_runtime::spawn_blocking(move || linux_ingest(app,kind,content_base64)).await.map_err(|e| e.to_string())? }
    #[cfg(not(target_os = "linux"))]
    { let _ = (app,kind,content_base64); Err("Native document worker unavailable on this platform".into()) }
}
#[cfg(target_os = "linux")]
fn linux_ingest(app: AppHandle, kind: String, content: String) -> Result<String,String> {
    use base64::Engine;
    use tauri::Manager;
    use std::{io::Write, path::PathBuf, process::Command, time::Duration};
    const LIMIT: usize = 25*1024*1024;
    static SLOTS: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    let _slot = SLOTS.get_or_init(|| std::sync::Mutex::new(())).try_lock().map_err(|_| "Document worker busy")?;
    if !matches!(kind.as_str(),"pdf"|"docx"|"xlsx"|"txt") || content.len() > ((LIMIT+2)/3)*4 { return Err("Invalid document type or size".into()); }
    let bytes = base64::engine::general_purpose::STANDARD.decode(content).map_err(|_| "Invalid base64 document")?;
    if bytes.len()>LIMIT { return Err("Document size limit exceeded".into()); }
    let state=app.state::<crate::state::AppState>();
    let python=crate::commands::install::resolve_lu_python(state.inner());
    if python.is_empty() { return Err("Native document worker requires Python with pypdf and openpyxl".into()); }
    let python=which::which(python).map_err(|_| "Python executable not found")?;
    let script=app.path().resource_dir().ok().map(|p|p.join("resources/omega_ingest.py")).filter(|p|p.is_file())
        .or_else(|| {let p=PathBuf::from("resources/omega_ingest.py");p.is_file().then_some(p)})
        .ok_or("Native document worker resource missing")?;
    let script=script.canonicalize().map_err(|e| e.to_string())?;
    let mut input=tempfile::NamedTempFile::new().map_err(|e|e.to_string())?;
    input.write_all(&bytes).map_err(|e|e.to_string())?;
    drop(bytes);
    let mut cmd=Command::new(python);
    cmd.env_clear().arg("-I").arg(script).arg(kind).arg(input.path());
    let raw=super::shell::output_bounded(cmd,Duration::from_secs(30)).ok_or("Native document worker failed or timed out")?;
    let reply:serde_json::Value=serde_json::from_str(&raw).map_err(|_|"Invalid document worker reply")?;
    if let Some(e)=reply.get("error").and_then(|e|e.as_str()){return Err(e.to_string());}
    let text=reply.get("text").and_then(|v|v.as_str()).ok_or("Document worker returned no text")?;
    if text.len()>180_000{return Err("Document output limit exceeded".into());}
    Ok(text.to_string())
}
