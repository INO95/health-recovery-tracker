from pathlib import Path

from app.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    def __init__(self, base_dir: str) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, upload_id: str, original_filename: str, file_bytes: bytes) -> str:
        ext = Path(original_filename or "").suffix
        safe_ext = "".join(ch for ch in ext if ch.isalnum() or ch == ".")
        file_path = self.base_dir / f"{upload_id}{safe_ext}"
        file_path.write_bytes(file_bytes)
        return str(file_path)

