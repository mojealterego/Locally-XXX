//! Linux kernel namespace isolation for agent shell execution. No host fallback.
use std::process::Command;

#[cfg(not(target_os = "linux"))]
const UNSUPPORTED: &str = "Isolated agent shell unavailable on this platform / Brak izolowanej powłoki agenta";

#[cfg(target_os = "linux")]
mod linux {
    use super::Command;
    use std::fs;
    use std::path::{Path, PathBuf};
    const BWRAP: &str = "/usr/bin/bwrap";
    const BASH: &str = "/bin/bash";

    fn checked_slug(id: Option<&str>) -> Result<&str, String> {
        let value = id.ok_or("Missing chat workspace identity")?;
        if value.is_empty() || value.len() > 64 || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err("Invalid chat workspace identity".into());
        }
        Ok(value)
    }

    fn ensure_dir(path: &Path) -> Result<(), String> {
        match fs::create_dir(path) {
            Ok(()) => {},
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
            Err(e) => return Err(format!("Create workspace: {e}")),
        }
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !meta.is_dir() || meta.file_type().is_symlink() { return Err("Unsafe workspace directory".into()); }
        Ok(())
    }

    fn resolve_workspace(home: &Path, id: Option<&str>, cwd: Option<&str>, working_directory: Option<&str>) -> Result<(PathBuf,PathBuf),String> {
        let slug = checked_slug(id)?;
        let home = home.canonicalize().map_err(|e| e.to_string())?;
        let base = home.join("agent-workspace");
        ensure_dir(&base)?;
        let root = base.join(slug);
        ensure_dir(&root)?;
        if root.canonicalize().map_err(|e| e.to_string())? != root { return Err("Unsafe workspace root".into()); }
        // A model-provided cwd or workingDirectory is not authorization to mount a host folder.
        for requested in [cwd, working_directory].into_iter().flatten() {
            if requested.is_empty() { return Err("Empty working directory".into()); }
            let requested = Path::new(requested);
            let absolute = if requested.is_absolute() { requested.to_path_buf() } else { root.join(requested) };
            let resolved = absolute.canonicalize().map_err(|e| e.to_string())?;
            if !resolved.is_dir() || !resolved.starts_with(&root) { return Err("Directory outside isolated chat workspace".into()); }
        }
        let relative = match cwd.or(working_directory) {
            Some(value) => {
                let path = Path::new(value);
                let path = if path.is_absolute() { path.to_path_buf() } else { root.join(path) };
                path.canonicalize().map_err(|e| e.to_string())?.strip_prefix(&root).map_err(|_| "Unsafe working directory")?.to_path_buf()
            },
            None => PathBuf::new(),
        };
        Ok((root, Path::new("/work").join(relative)))
    }

    fn command_for(root: &Path, workdir: &Path, script: &str, args: &[String]) -> Command {
        let mut cmd = Command::new(BWRAP);
        cmd.env_clear().args(["--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/tmp", "--setenv", "TMPDIR", "/tmp", "--setenv", "LC_ALL", "C.UTF-8"]);
        // Bind only system executables/libraries and loader metadata read-only.
        for system in ["/usr", "/bin", "/lib", "/lib64", "/etc/ld.so.cache", "/etc/alternatives"] {
            if Path::new(system).exists() { cmd.args(["--ro-bind", system, system]); }
        }
        cmd.args(["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/work", "--bind"])
            .arg(root).arg("/work").arg("--chdir").arg(workdir)
            .args(["--", BASH, "--noprofile", "--norc", "-c", script, "omega-agent"]).args(args);
        cmd
    }

    pub fn prepare(command: &str, args: &[String], cwd: Option<&str>, shell: Option<&str>, chat: Option<&str>, working_directory: Option<&str>) -> Result<Command,String> {
        if !matches!(shell, None | Some("bash") | Some("/bin/bash")) { return Err("Only the isolated Bash interpreter is supported".into()); }
        if command.len() > 131072 || args.len() > 128 || args.iter().any(|a| a.len() > 4096) { return Err("Shell input limit exceeded".into()); }
        if !Path::new(BWRAP).is_file() || !Path::new(BASH).is_file() { return Err("Required Linux isolation adapter missing: /usr/bin/bwrap or /bin/bash".into()); }
        let home = dirs::home_dir().ok_or("Home directory unavailable")?;
        let (root, workdir) = resolve_workspace(&home,chat,cwd,working_directory)?;
        Ok(command_for(&root,&workdir,command,args))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::os::unix::fs::symlink;
        #[test] fn denies_traversal_and_external_cwd() {
            let home = tempfile::tempdir().unwrap();
            assert!(resolve_workspace(home.path(),Some(".."),None,None).is_err());
            assert!(resolve_workspace(home.path(),None,None,None).is_err());
            assert!(resolve_workspace(home.path(),Some("chat"),Some("/"),None).is_err());
            assert!(resolve_workspace(home.path(),Some("chat"),None,Some("/" )).is_err());
        }
        #[test] fn rejects_symlinks_outside_workspace() {
            let home = tempfile::tempdir().unwrap();
            let (root, _) = resolve_workspace(home.path(),Some("chat"),None,None).unwrap();
            symlink("/", root.join("escape")).unwrap();
            assert!(resolve_workspace(home.path(),Some("chat"),Some("escape"),None).is_err());
        }
        #[test] fn fixed_adapter_and_command_boundary() {
            let cmd = command_for(Path::new("/x"),Path::new("/work"),"echo test",&["--unshare-net".into()]);
            assert_eq!(cmd.get_program(), BWRAP);
            let args: Vec<_> = cmd.get_args().map(|x|x.to_str().unwrap()).collect();
            assert!(args.contains(&"--unshare-all"));
            assert!(args.contains(&"--clearenv"));
            assert!(args.ends_with(&["--",BASH,"--noprofile","--norc","-c","echo test","omega-agent","--unshare-net"]));
        }
    }
}

pub fn prepare(command: &str, args: &[String], cwd: Option<&str>, shell: Option<&str>, chat: Option<&str>, working_directory: Option<&str>) -> Result<Command,String> {
    #[cfg(target_os = "linux")]
    { linux::prepare(command,args,cwd,shell,chat,working_directory) }
    #[cfg(not(target_os = "linux"))]
    { let _ = (command,args,cwd,shell,chat,working_directory); Err(UNSUPPORTED.into()) }
}
