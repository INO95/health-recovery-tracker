import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_upload_create_list_get_and_enqueue_payload(tmp_path: Path) -> None:
    captured = {}

    def fake_enqueue(payload: dict) -> str:
        captured["payload"] = payload
        return "job-test-1"

    db_path = tmp_path / "upload_test.db"
    upload_dir = tmp_path / "uploads"
    app = create_app(
        database_url=f"sqlite:///{db_path}",
        parser_version="tc03-parser-v1",
        enqueue_func=fake_enqueue,
        upload_dir=str(upload_dir),
        auto_migrate=True,
    )
    client = TestClient(app)

    files = {"file": ("test.png", b"fake-image-bytes", "image/png")}
    response = client.post("/api/uploads", files=files)
    assert response.status_code == 201
    created = response.json()

    upload_uuid = uuid.UUID(created["id"])
    assert str(upload_uuid) == created["id"]
    assert created["status"] == "pending"
    assert created["filename"] == "test.png"
    assert created["original_filename"] == "test.png"
    assert created["parser_version"] == "tc03-parser-v1"
    assert created["storage_path"] != ""
    assert created["size_bytes"] == len(b"fake-image-bytes")
    assert created["queue_job_id"] == "job-test-1"
    assert Path(created["storage_path"]).exists()

    upload_id = created["id"]
    assert captured["payload"]["upload_id"] == upload_id
    assert captured["payload"]["storage_path"] == created["storage_path"]
    assert captured["payload"]["parser_version"] == "tc03-parser-v1"

    list_response = client.get("/api/uploads")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 1
    assert items[0]["id"] == upload_id

    get_response = client.get(f"/api/uploads/{upload_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == upload_id
