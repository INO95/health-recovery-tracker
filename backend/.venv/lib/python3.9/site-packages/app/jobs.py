from typing import Dict, Union
from uuid import UUID


def build_upload_job_payload(upload_id: Union[str, UUID], storage_path: str, parser_version: str) -> Dict[str, str]:
    return {
        "upload_id": str(upload_id),
        "storage_path": storage_path,
        "parser_version": parser_version,
    }


def process_upload(payload: dict) -> dict:
    # TODO: TC-05에서 실제 파서/후처리 로직으로 교체한다.
    return payload
