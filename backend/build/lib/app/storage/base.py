from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    def save(self, upload_id: str, original_filename: str, file_bytes: bytes) -> str:
        raise NotImplementedError

