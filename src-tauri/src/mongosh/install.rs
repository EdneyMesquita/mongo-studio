//! Downloading MongoDB's mongosh build into the app's data folder.
//!
//! Layout: `<data_dir>/<version>/mongosh[.exe]`, plus a `current` file
//! naming the version in use. Only the executable is unpacked: the
//! `mongosh_crypt_v1` library next to it in the archive is under a
//! different, non-open-source license.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use super::feed::Release;
use crate::error::{AppError, AppResult};

const CURRENT_FILE: &str = "current";
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

pub fn binary_name() -> &'static str {
    if cfg!(windows) {
        "mongosh.exe"
    } else {
        "mongosh"
    }
}

/// The downloaded executable the `current` file points at, if it's there.
pub fn installed_binary(data_dir: &Path) -> Option<PathBuf> {
    let version = std::fs::read_to_string(data_dir.join(CURRENT_FILE)).ok()?;
    let version = version.trim();
    if !is_version_name(version) {
        return None;
    }
    let path = data_dir.join(version).join(binary_name());
    path.is_file().then_some(path)
}

/// A version string that is safe to use as a folder name.
fn is_version_name(version: &str) -> bool {
    !version.is_empty()
        && !version.starts_with('.')
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

fn progress(phase: &str, received: u64, total: Option<u64>) -> serde_json::Value {
    serde_json::json!({ "phase": phase, "received": received, "total": total })
}

/// Downloads `release`, checks it and makes it the version in use.
pub async fn install(
    data_dir: &Path,
    client: &reqwest::Client,
    release: &Release,
    on_progress: &(impl Fn(serde_json::Value) + Send + Sync),
) -> AppResult<()> {
    if !is_version_name(&release.version) {
        return Err(AppError::InvalidInput(format!(
            "unexpected mongosh version {:?} in the feed",
            release.version
        )));
    }
    tokio::fs::create_dir_all(data_dir).await?;
    let part = data_dir.join(format!(".download-{}.part", uuid::Uuid::new_v4().simple()));
    let result = async {
        let (digest, size) = download_to(client, release, &part, on_progress).await?;
        on_progress(progress("verify", size, Some(size)));
        if digest != release.sha256 {
            return Err(AppError::InvalidInput(
                "the downloaded mongosh doesn't match MongoDB's checksum; try again".to_string(),
            ));
        }
        on_progress(progress("unpack", size, Some(size)));
        let archive = part.clone();
        let dir = data_dir.to_path_buf();
        let version = release.version.clone();
        let zip = release.zip;
        tokio::task::spawn_blocking(move || unpack(&archive, zip, &dir, &version))
            .await
            .map_err(|_| AppError::InvalidInput("unpacking mongosh panicked".to_string()))??;
        Ok(size)
    }
    .await;
    let _ = tokio::fs::remove_file(&part).await;
    let size = result?;

    set_current(data_dir, &release.version)?;
    remove_other_versions(data_dir, &release.version);
    on_progress(progress("done", size, Some(size)));
    Ok(())
}

/// Streams the archive to `dest`, hashing it on the way. Returns the
/// SHA-256 in hex and the byte count.
async fn download_to(
    client: &reqwest::Client,
    release: &Release,
    dest: &Path,
    on_progress: &(impl Fn(serde_json::Value) + Send + Sync),
) -> AppResult<(String, u64)> {
    let response = client
        .get(&release.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| AppError::InvalidInput(format!("can't download mongosh: {e}")))?;
    let total = response.content_length();
    let mut file = tokio::fs::File::create(dest).await?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    on_progress(progress("download", 0, total));
    let mut last = Instant::now();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::InvalidInput(format!("the download broke off: {e}")))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;
        if last.elapsed() >= PROGRESS_EVERY {
            last = Instant::now();
            on_progress(progress("download", received, total));
        }
    }
    file.flush().await?;
    on_progress(progress("download", received, total));
    Ok((hex(&hasher.finalize()), received))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Whether an archive entry is the executable: `<top>/bin/mongosh[.exe]`,
/// not one of macOS's `._` resource-fork twins.
fn is_binary_entry(path: &Path, name: &str) -> bool {
    let parts: Vec<&str> = path
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect();
    parts.len() >= 2
        && parts[parts.len() - 1] == name
        && parts[parts.len() - 2] == "bin"
        && !parts.iter().any(|p| p.starts_with("._"))
}

/// Unpacks the executable into `<data_dir>/<version>/`, through a staging
/// folder so a failure leaves nothing half-written behind.
fn unpack(archive: &Path, zip: bool, data_dir: &Path, version: &str) -> AppResult<()> {
    let staging = data_dir.join(format!(".unpack-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&staging)?;
    let result = (|| {
        let target = staging.join(binary_name());
        let found = if zip {
            extract_from_zip(archive, &target)?
        } else {
            extract_from_tgz(archive, &target)?
        };
        if !found {
            return Err(AppError::InvalidInput(
                "the mongosh archive has no bin/mongosh in it".to_string(),
            ));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
        }
        let final_dir = data_dir.join(version);
        if final_dir.exists() {
            std::fs::remove_dir_all(&final_dir)?;
        }
        std::fs::rename(&staging, &final_dir)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

fn copy_out(mut from: impl Read, target: &Path) -> AppResult<()> {
    let mut out = std::fs::File::create(target)?;
    std::io::copy(&mut from, &mut out)?;
    out.flush()?;
    Ok(())
}

fn extract_from_tgz(archive: &Path, target: &Path) -> AppResult<bool> {
    let file = std::fs::File::open(archive)?;
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(file));
    for entry in tar.entries()? {
        let entry = entry?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry.path()?.into_owned();
        if is_binary_entry(&path, binary_name()) {
            copy_out(entry, target)?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn extract_from_zip(archive: &Path, target: &Path) -> AppResult<bool> {
    let bad = |e: zip::result::ZipError| {
        AppError::InvalidInput(format!("the mongosh archive is unreadable: {e}"))
    };
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(bad)?;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(bad)?;
        if !entry.is_file() {
            continue;
        }
        let Some(path) = entry.enclosed_name() else {
            continue;
        };
        if is_binary_entry(&path, binary_name()) {
            copy_out(entry, target)?;
            return Ok(true);
        }
    }
    Ok(false)
}

/// Points `current` at `version`, replacing the file in one step.
fn set_current(data_dir: &Path, version: &str) -> AppResult<()> {
    let tmp = data_dir.join(format!(".{CURRENT_FILE}.tmp"));
    std::fs::write(&tmp, version)?;
    std::fs::rename(&tmp, data_dir.join(CURRENT_FILE))?;
    Ok(())
}

/// Deletes the other versions' folders. A copy still running (Windows
/// keeps its file locked) stays until the next download.
fn remove_other_versions(data_dir: &Path, keep: &str) {
    let Ok(entries) = std::fs::read_dir(data_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name != keep && is_version_name(name) && entry.path().is_dir() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mongo-studio-mongosh-{tag}-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const ENTRIES: [(&str, &[u8]); 4] = [
        ("mongosh-9.9.9-x/LICENSE-mongosh", b"license"),
        ("mongosh-9.9.9-x/bin/._mongosh", b"resource fork"),
        ("mongosh-9.9.9-x/bin/mongosh_crypt_v1.so", b"not ours"),
        ("mongosh-9.9.9-x/bin/MONGOSH", b"#!binary"),
    ];

    fn entries() -> Vec<(String, &'static [u8])> {
        ENTRIES
            .iter()
            .map(|(p, b)| (p.replace("MONGOSH", binary_name()), *b))
            .collect()
    }

    fn write_tgz(path: &Path) {
        let file = std::fs::File::create(path).unwrap();
        let gz = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
        let mut tar = tar::Builder::new(gz);
        for (name, body) in entries() {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, name, body).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
    }

    fn write_zip(path: &Path) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, body) in entries() {
            zip.start_file(name, options).unwrap();
            zip.write_all(body).unwrap();
        }
        zip.finish().unwrap();
    }

    fn assert_only_the_binary(dir: &Path) {
        let names: Vec<String> = std::fs::read_dir(dir.join("9.9.9"))
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec![binary_name().to_string()]);
        let body = std::fs::read(dir.join("9.9.9").join(binary_name())).unwrap();
        assert_eq!(body, b"#!binary");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("9.9.9").join(binary_name()))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o755);
        }
    }

    #[test]
    fn a_tgz_gives_up_only_the_executable() {
        let dir = temp_dir("tgz");
        let archive = dir.join("a.tgz");
        write_tgz(&archive);
        unpack(&archive, false, &dir, "9.9.9").unwrap();
        assert_only_the_binary(&dir);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_zip_gives_up_only_the_executable() {
        let dir = temp_dir("zip");
        let archive = dir.join("a.zip");
        write_zip(&archive);
        unpack(&archive, true, &dir, "9.9.9").unwrap();
        assert_only_the_binary(&dir);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_archive_without_the_executable_leaves_nothing_behind() {
        let dir = temp_dir("empty");
        let archive = dir.join("a.tgz");
        {
            let file = std::fs::File::create(&archive).unwrap();
            let gz = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
            let mut tar = tar::Builder::new(gz);
            let mut header = tar::Header::new_gnu();
            header.set_size(1);
            header.set_cksum();
            tar.append_data(&mut header, "x/README", &b"x"[..]).unwrap();
            tar.into_inner().unwrap().finish().unwrap();
        }
        assert!(unpack(&archive, false, &dir, "9.9.9").is_err());
        let left: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        assert_eq!(left.len(), 1, "only the archive should remain");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn current_points_at_the_installed_version_and_old_ones_go() {
        let dir = temp_dir("current");
        for version in ["2.12.0", "2.13.0"] {
            std::fs::create_dir_all(dir.join(version)).unwrap();
            std::fs::write(dir.join(version).join(binary_name()), b"x").unwrap();
        }
        assert_eq!(installed_binary(&dir), None);
        set_current(&dir, "2.13.0").unwrap();
        remove_other_versions(&dir, "2.13.0");
        assert_eq!(
            installed_binary(&dir),
            Some(dir.join("2.13.0").join(binary_name()))
        );
        assert!(!dir.join("2.12.0").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn version_names_cannot_leave_the_folder() {
        assert!(is_version_name("2.13.0"));
        assert!(is_version_name("2.14.0-beta.1"));
        for bad in ["", "..", "../x", "a/b", ".hidden", "a\\b"] {
            assert!(!is_version_name(bad), "{bad}");
        }
    }

    #[test]
    fn entries_are_matched_by_their_last_two_parts() {
        let name = "mongosh";
        assert!(is_binary_entry(
            Path::new("mongosh-2.13.0-linux-x64/bin/mongosh"),
            name
        ));
        assert!(!is_binary_entry(
            Path::new("x/bin/mongosh_crypt_v1.so"),
            name
        ));
        assert!(!is_binary_entry(Path::new("x/bin/._mongosh"), name));
        assert!(!is_binary_entry(
            Path::new("__MACOSX/._x/bin/mongosh"),
            name
        ));
        assert!(!is_binary_entry(Path::new("x/lib/mongosh"), name));
        assert!(!is_binary_entry(Path::new("mongosh"), name));
    }

    #[test]
    fn hex_is_lowercase_and_padded() {
        assert_eq!(hex(&[0x00, 0xab, 0x0f]), "00ab0f");
        assert_eq!(
            hex(&Sha256::digest(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
