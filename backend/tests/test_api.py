import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing app
os.environ["DATABASE_URL"] = "sqlite:///./data/test_app.db"
os.environ["LLM_API_KEYS"] = "test_key_1,test_key_2"
os.environ["ENABLE_FAILURE_SIMULATION"] = "true"
os.environ["LLM_MODEL"] = "gemini/gemini-2.0-flash"

from app.main import app
from app.db import init_db
from app.config import settings

@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    await init_db()
    yield
    # Clean up test database if needed
    test_db_path = settings.SQLITE_PATH
    if os.path.exists(test_db_path):
        try:
            os.remove(test_db_path)
        except Exception:
            pass

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["keys_configured"] >= 2
        assert data["cache_enabled"] is True

@pytest.mark.asyncio
async def test_validation_errors():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Missing message / session_id
        res = await ac.post("/chat", json={"session_id": ""})
        assert res.status_code == 422
        assert "detail" in res.json()
        
        # Message over 4000 characters
        res = await ac.post("/chat", json={"session_id": "test-session", "message": "a" * 4001})
        assert res.status_code == 422
        assert "detail" in res.json()

@pytest.mark.asyncio
async def test_session_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/sessions/nonexistent-session-id/messages")
        assert res.status_code == 404
        assert res.json() == {"detail": "session not found"}

@pytest.mark.asyncio
async def test_chat_live_and_multi_turn():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = "test-multi-turn-session"
        
        # 1. Send first message
        res1 = await ac.post("/chat", json={"session_id": session_id, "message": "Hello AI"})
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["session_id"] == session_id
        assert "reply" in d1 and len(d1["reply"]) > 0
        assert d1["metadata"]["resolution_source"] == "LIVE_INFERENCE"
        assert d1["metadata"]["key_id"] == "key_1"
        assert d1["metadata"]["fallback_attempts"] == 0
        assert d1["metadata"]["input_tokens"] > 0
        assert d1["metadata"]["output_tokens"] > 0
        
        # 2. Check session history stored in SQLite
        history_res = await ac.get(f"/sessions/{session_id}/messages")
        assert history_res.status_code == 200
        h_data = history_res.json()
        assert len(h_data["messages"]) == 2
        assert h_data["messages"][0]["role"] == "user"
        assert h_data["messages"][0]["content"] == "Hello AI"
        assert h_data["messages"][1]["role"] == "assistant"
        assert "metadata" in h_data["messages"][1]

@pytest.mark.asyncio
async def test_caching_behavior():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # PDF requirement: "The same first message sent in a new session must return LLM_CACHE the second time."
        first_session = "sess-cache-1"
        second_session = "sess-cache-2"
        common_message = "What is the capital of France?"
        
        # Call 1: New session -> LIVE_INFERENCE
        res1 = await ac.post("/chat", json={"session_id": first_session, "message": common_message})
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["metadata"]["resolution_source"] == "LIVE_INFERENCE"
        
        # Call 2: New session, identical message -> LLM_CACHE
        res2 = await ac.post("/chat", json={"session_id": second_session, "message": common_message})
        assert res2.status_code == 200
        d2 = res2.json()
        assert d2["metadata"]["resolution_source"] == "LLM_CACHE"
        assert d2["reply"] == d1["reply"] # Identical reply
        assert d2["metadata"]["key_id"] is None # null on LLM_CACHE
        assert d2["metadata"]["fallback_attempts"] == 0 # 0 on LLM_CACHE
        assert d2["metadata"]["latency_ms"] <= d1["metadata"]["latency_ms"] + 50

@pytest.mark.asyncio
async def test_simulate_failure_failover():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Test key_1=429 -> should fail over to key_2 with status 200
        res = await ac.post(
            "/chat",
            json={"session_id": "test-failover-1", "message": "Testing failover"},
            headers={"X-Simulate-Failure": "key_1=429"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["metadata"]["key_id"] == "key_2"
        assert data["metadata"]["fallback_attempts"] == 1
        
        # Test key_1=500 -> should also fail over to key_2
        res2 = await ac.post(
            "/chat",
            json={"session_id": "test-failover-2", "message": "Testing 500 failover"},
            headers={"X-Simulate-Failure": "key_1=500"}
        )
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["metadata"]["key_id"] == "key_2"

@pytest.mark.asyncio
async def test_simulate_all_keys_failed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = "test-all-failed"
        # Test *=429 -> all fail, returns 503 {"detail": "all providers unavailable"}
        res = await ac.post(
            "/chat",
            json={"session_id": session_id, "message": "Should fail completely"},
            headers={"X-Simulate-Failure": "*=429"}
        )
        assert res.status_code == 503
        assert res.json() == {"detail": "all providers unavailable"}
        
        # Verify nothing was added to SQLite history
        h_res = await ac.get(f"/sessions/{session_id}/messages")
        assert h_res.status_code == 404
