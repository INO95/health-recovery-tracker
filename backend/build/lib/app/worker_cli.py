import os

from redis import Redis
from rq import Queue, SimpleWorker


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    queue_name = os.getenv("RQ_QUEUE_NAME", "uploads")
    redis_conn = Redis.from_url(redis_url)
    queue = Queue(queue_name, connection=redis_conn)
    # macOS 로컬 개발에서 fork work-horse 이슈를 피하기 위해 SimpleWorker를 기본 사용한다.
    worker = SimpleWorker([queue], connection=redis_conn)
    worker.work()


if __name__ == "__main__":
    main()
