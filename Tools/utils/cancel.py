import os

# Tools and projects service share the same Docker volume at /app/images.
# Projects service writes a marker file named after the messageId into this directory.
CANCEL_DIR = os.getenv("CANCEL_DIR", "/app/images/cancel")


def is_cancelled(message_id: str) -> bool:
    if not message_id:
        return False
    try:
        return os.path.exists(os.path.join(CANCEL_DIR, str(message_id)))
    except Exception:
        return False
