use std::{ffi::OsString, path::PathBuf};

pub struct StoragePaths {
    pub data: PathBuf,
    pub downloads: PathBuf,
}

impl StoragePaths {
    pub fn resolve() -> Result<Self, String> {
        let legacy = dirs::document_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Documents"))
            .join("Editor");
        Self::from_options(
            std::env::args_os().skip(1).collect(),
            std::env::var_os("EDITOR_DATA_DIR"),
            std::env::var_os("EDITOR_DOWNLOAD_DIR"),
            legacy,
            crate::export::default_folder()?,
        )
    }

    fn from_options(
        arguments: Vec<OsString>,
        data_override: Option<OsString>,
        download_override: Option<OsString>,
        legacy_data: PathBuf,
        exports: PathBuf,
    ) -> Result<Self, String> {
        let mut data_arg = None;
        let mut downloads_arg = None;
        let mut arguments = arguments.into_iter();
        while let Some(argument) = arguments.next() {
            if argument == "--data-dir" || argument == "--downloads-dir" {
                let value = arguments.next().ok_or("Falta la carpeta de datos o descargas.")?;
                let path = PathBuf::from(value);
                if !path.is_absolute() {
                    return Err("La carpeta de datos o descargas debe ser una ruta absoluta.".into());
                }
                if argument == "--data-dir" { data_arg = Some(path); }
                else { downloads_arg = Some(path); }
            }
        }
        let isolated = data_override.is_some();
        let data = data_override.map(PathBuf::from).or(data_arg).unwrap_or(legacy_data);
        let downloads = download_override.map(PathBuf::from).or(downloads_arg)
            .unwrap_or_else(|| if isolated { data.join("descargas") } else { exports.join("descargas") });
        Ok(Self { data, downloads })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_routes_data_and_downloads_without_mixing_them() {
        let options = vec!["--data-dir", "C:/editor/datos", "--downloads-dir", "C:/Videos/ediciones/descargas"];
        let paths = StoragePaths::from_options(options.into_iter().map(OsString::from).collect(), None, None,
            PathBuf::from("C:/Documents/Editor"), PathBuf::from("C:/Videos/ediciones")).unwrap();
        assert_eq!(paths.data, PathBuf::from("C:/editor/datos"));
        assert_eq!(paths.downloads, PathBuf::from("C:/Videos/ediciones/descargas"));
        let defaults = StoragePaths::from_options(vec![], None, None, paths.data.clone(), PathBuf::from("C:/Videos/ediciones")).unwrap();
        assert_eq!(defaults.downloads, paths.downloads);
    }

    #[test]
    fn isolated_tests_keep_downloads_under_their_data_directory() {
        let paths = StoragePaths::from_options(vec![], Some("C:/test-data".into()), None,
            PathBuf::from("C:/Documents/Editor"), PathBuf::from("C:/Videos/ediciones")).unwrap();
        assert_eq!(paths.data, PathBuf::from("C:/test-data"));
        assert_eq!(paths.downloads, paths.data.join("descargas"));
        let explicit = StoragePaths::from_options(vec![], Some("C:/test-data".into()), Some("C:/test-downloads".into()),
            PathBuf::new(), PathBuf::new()).unwrap();
        assert_eq!(explicit.downloads, PathBuf::from("C:/test-downloads"));
        assert!(StoragePaths::from_options(vec!["--data-dir".into(), "relative".into()], None, None, PathBuf::new(), PathBuf::new()).is_err());
    }
}
