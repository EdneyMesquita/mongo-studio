//! MongoDB's release feed for mongosh: which build to download for this
//! machine.

use std::time::Duration;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

pub const FEED_URL: &str = "https://downloads.mongodb.com/compass/mongosh.json";

#[derive(Debug, Deserialize)]
pub struct Feed {
    pub versions: Vec<FeedVersion>,
}

#[derive(Debug, Deserialize)]
pub struct FeedVersion {
    pub version: String,
    #[serde(default)]
    pub downloads: Vec<FeedDownload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedDownload {
    // Old versions' entries lack some of these, so nothing here is required.
    #[serde(default)]
    pub arch: String,
    #[serde(default)]
    pub distro: String,
    /// Builds linked against the system's OpenSSL; the default build has
    /// its own.
    #[serde(default)]
    pub shared_openssl: Option<String>,
    #[serde(default)]
    pub archive: Option<FeedArchive>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedArchive {
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub sha256: String,
}

/// The archive to download: the latest version's build for this OS and CPU.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Release {
    pub version: String,
    pub url: String,
    pub sha256: String,
    pub zip: bool,
}

/// The feed's `distro` and `arch` names for the machine we run on, or
/// `None` where MongoDB publishes no archive.
pub fn this_platform() -> Option<(&'static str, &'static str)> {
    let distro = match std::env::consts::OS {
        "linux" => "linux",
        "macos" => "darwin",
        "windows" => "win32",
        _ => return None,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "arm64",
        _ => return None,
    };
    Some((distro, arch))
}

/// The latest version's archive for `distro`/`arch`, skipping the Linux
/// builds that need the system's OpenSSL and the installer packages.
pub fn pick(feed: &Feed, distro: &str, arch: &str) -> AppResult<Release> {
    let latest = feed
        .versions
        .first()
        .ok_or_else(|| AppError::InvalidInput("the mongosh feed lists no versions".to_string()))?;
    latest
        .downloads
        .iter()
        .filter(|d| d.distro == distro && d.arch == arch && d.shared_openssl.is_none())
        .filter_map(|d| d.archive.as_ref())
        .find(|a| a.kind == "tgz" || a.kind == "zip")
        .map(|a| Release {
            version: latest.version.clone(),
            url: a.url.clone(),
            sha256: a.sha256.to_ascii_lowercase(),
            zip: a.kind == "zip",
        })
        .ok_or_else(|| {
            AppError::InvalidInput(format!(
                "MongoDB publishes no mongosh {} build for {distro} {arch}",
                latest.version
            ))
        })
}

pub fn http_client(timeout: Option<Duration>) -> AppResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .user_agent(concat!("mongo-studio/", env!("CARGO_PKG_VERSION")));
    if let Some(timeout) = timeout {
        builder = builder.timeout(timeout);
    }
    builder
        .build()
        .map_err(|e| AppError::InvalidInput(format!("can't set up the download: {e}")))
}

/// Fetches the feed and picks this machine's archive.
pub async fn fetch_release(client: &reqwest::Client) -> AppResult<Release> {
    let (distro, arch) = this_platform().ok_or_else(|| {
        AppError::InvalidInput(format!(
            "MongoDB publishes no mongosh build for {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    })?;
    let feed: Feed = client
        .get(FEED_URL)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| AppError::InvalidInput(format!("can't reach MongoDB's download feed: {e}")))?
        .json()
        .await
        .map_err(|e| {
            AppError::InvalidInput(format!("MongoDB's download feed is unreadable: {e}"))
        })?;
    pick(&feed, distro, arch)
}

/// The archive's size from a HEAD request (the feed doesn't list it).
pub async fn archive_size(client: &reqwest::Client, url: &str) -> Option<u64> {
    let response = client
        .head(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed() -> Feed {
        serde_json::from_value(serde_json::json!({
            "versions": [
                {
                    "version": "2.13.0",
                    "downloads": [
                        { "arch": "x86_64", "distro": "linux", "sharedOpenssl": "openssl3",
                          "archive": { "type": "tgz", "url": "https://x/linux-x64-openssl3.tgz", "sha256": "aa" } },
                        { "arch": "x86_64", "distro": "deb",
                          "archive": { "type": "deb", "url": "https://x/amd64.deb", "sha256": "bb" } },
                        { "arch": "x86_64", "distro": "linux", "targets": ["ubuntu2404"],
                          "archive": { "type": "tgz", "url": "https://x/linux-x64.tgz", "sha256": "CC", "sha1": "x" } },
                        { "arch": "arm64", "distro": "darwin",
                          "archive": { "type": "zip", "url": "https://x/darwin-arm64.zip", "sha256": "dd" } },
                        { "arch": "x86_64", "distro": "win32msi",
                          "archive": { "type": "msi", "url": "https://x/x64.msi", "sha256": "ee" } },
                        { "arch": "x86_64", "distro": "win32",
                          "archive": { "type": "zip", "url": "https://x/win32-x64.zip", "sha256": "ff" } }
                    ]
                },
                {
                    "version": "2.12.0",
                    "downloads": [
                        { "arch": "x64", "archive": { "type": "zip", "url": "https://x/old.zip", "sha256": "11" } },
                        { "arch": "arm64", "distro": "linux",
                          "archive": { "type": "tgz", "url": "https://x/old-arm64.tgz", "sha256": "00" } }
                    ]
                }
            ]
        }))
        .unwrap()
    }

    #[test]
    fn linux_takes_the_build_with_its_own_openssl() {
        let release = pick(&feed(), "linux", "x86_64").unwrap();
        assert_eq!(
            release,
            Release {
                version: "2.13.0".to_string(),
                url: "https://x/linux-x64.tgz".to_string(),
                sha256: "cc".to_string(),
                zip: false,
            }
        );
    }

    #[test]
    fn macos_and_windows_take_the_zip() {
        let mac = pick(&feed(), "darwin", "arm64").unwrap();
        assert_eq!(mac.url, "https://x/darwin-arm64.zip");
        assert!(mac.zip);
        let win = pick(&feed(), "win32", "x86_64").unwrap();
        assert_eq!(win.url, "https://x/win32-x64.zip");
    }

    #[test]
    fn only_the_latest_version_counts() {
        let err = pick(&feed(), "linux", "arm64").unwrap_err();
        assert!(err.to_string().contains("2.13.0"), "{err}");
    }

    #[test]
    fn this_platform_has_names_the_feed_uses() {
        if let Some((distro, arch)) = this_platform() {
            assert!(["linux", "darwin", "win32"].contains(&distro));
            assert!(["x86_64", "arm64"].contains(&arch));
        }
    }
}
