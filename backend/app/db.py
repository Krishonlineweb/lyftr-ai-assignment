import aiosqlite
import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.config import settings

def get_db_path() -> str:
    path = settings.SQLITE_PATH
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    return path

async def init_db():
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            );
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
        """)
        await db.commit()

async def check_db_health() -> bool:
    try:
        db_path = get_db_path()
        async with aiosqlite.connect(db_path) as db:
            async with db.execute("SELECT 1;") as cursor:
                row = await cursor.fetchone()
                return row is not None and row[0] == 1
    except Exception:
        return False

async def get_session_messages(session_id: str) -> Optional[List[Dict[str, Any]]]:
    """
    Returns messages for a session. Returns None if session does not exist in DB.
    """
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, session_id, role, content, metadata, created_at FROM messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            if not rows:
                return None
            
            result = []
            for r in rows:
                item = {
                    "role": r["role"],
                    "content": r["content"]
                }
                if r["metadata"]:
                    try:
                        item["metadata"] = json.loads(r["metadata"])
                    except Exception:
                        item["metadata"] = r["metadata"]
                result.append(item)
            return result

async def save_message(session_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
    db_path = get_db_path()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata) if metadata is not None else None
    
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, role, content, meta_json, now_iso)
        )
        await db.commit()
