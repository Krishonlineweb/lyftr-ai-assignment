import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from app.config import settings
from app.db import init_db, check_db_health, get_session_messages, save_message
from app.schemas import (
    HealthResponse,
    ChatRequest,
    ChatResponse,
    ResponseMetadata,
    SessionMessagesResponse,
    MessageItem
)
from app.llm import execute_chat_completion, is_cache_enabled

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing SQLite database on startup...")
    await init_db()
    logger.info("Database initialized successfully.")
    yield

app = FastAPI(
    title="Lyftr AI LLM Gateway",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware (Must be attached to app before routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
async def get_health():
    """
    Returns 200 once the app is running, the database is reachable and the key pool is loaded.
    { "status": "ok", "keys_configured": 2, "cache_enabled": true }
    """
    db_ok = await check_db_health()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database unreachable")
    
    return HealthResponse(
        status="ok",
        keys_configured=len(settings.LLM_API_KEYS),
        cache_enabled=is_cache_enabled()
    )

@app.post("/chat", response_model=ChatResponse)
async def post_chat(
    req: ChatRequest,
    x_simulate_failure: Optional[str] = Header(None, alias="X-Simulate-Failure")
):
    """
    POST /chat
    Multi-turn chat with key failover, response caching, token tracking and SQLite history.
    """
    # 1. Fetch existing session history from SQLite
    existing_messages = await get_session_messages(req.session_id)
    
    # 2. Build message list for LLM
    llm_messages = []
    
    # System prompt: request system_prompt > default system prompt
    sys_prompt = req.system_prompt if req.system_prompt is not None else settings.DEFAULT_SYSTEM_PROMPT
    if sys_prompt:
        llm_messages.append({"role": "system", "content": sys_prompt})
        
    # Append history
    if existing_messages:
        for msg in existing_messages:
            llm_messages.append({"role": msg["role"], "content": msg["content"]})
            
    # Append current user message
    llm_messages.append({"role": "user", "content": req.message})
    
    # 3. Call LLM with key pool & fallback & caching
    try:
        reply_text, metadata = await execute_chat_completion(
            messages=llm_messages,
            simulate_header=x_simulate_failure
        )
    except Exception as e:
        logger.error(f"Inference failed: {e}")
        # When all keys fail (rate-limited, quota exhausted or 5xx)
        # Requirement: 503 {"detail": "all providers unavailable"}
        # Nothing is added to session history on failure!
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="all providers unavailable"
        )
        
    # 4. Save to SQLite ONLY after successful completion
    # Store user message
    await save_message(
        session_id=req.session_id,
        role="user",
        content=req.message,
        metadata=None
    )
    
    # Store assistant message with assistant metadata
    assistant_meta_for_db = {
        "resolution_source": metadata["resolution_source"],
        "input_tokens": metadata["input_tokens"],
        "output_tokens": metadata["output_tokens"]
    }
    await save_message(
        session_id=req.session_id,
        role="assistant",
        content=reply_text,
        metadata=assistant_meta_for_db
    )
    
    # 5. Return 200 response
    return ChatResponse(
        session_id=req.session_id,
        reply=reply_text,
        metadata=ResponseMetadata(**metadata)
    )

@app.get("/sessions/{session_id}/messages", response_model=SessionMessagesResponse)
async def get_session_history(session_id: str):
    """
    Returns the stored history of one session from SQLite, oldest first, without the system prompt.
    404 {"detail": "session not found"} if session does not exist.
    """
    messages = await get_session_messages(session_id)
    if messages is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="session not found"
        )
        
    formatted = [
        MessageItem(
            role=m["role"],
            content=m["content"],
            metadata=m.get("metadata")
        )
        for m in messages
    ]
    
    return SessionMessagesResponse(
        session_id=session_id,
        messages=formatted
    )
