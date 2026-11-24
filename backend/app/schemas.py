from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Union

class HealthResponse(BaseModel):
    status: str = "ok"
    keys_configured: int
    cache_enabled: bool

class ChatRequest(BaseModel):
    session_id: str
    message: str
    system_prompt: Optional[str] = None

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not v or not (1 <= len(v) <= 128):
            raise ValueError("session_id must be 1-128 characters")
        return v

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        trimmed = v.strip() if v else ""
        if not trimmed or len(trimmed) > 4000:
            raise ValueError("message must be 1-4000 characters after trimming whitespace")
        return trimmed

class ResponseMetadata(BaseModel):
    resolution_source: str # "LIVE_INFERENCE" or "LLM_CACHE"
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: Optional[str] = None # "key_1", "key_2", ... or null on LLM_CACHE
    fallback_attempts: int

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    metadata: ResponseMetadata

class MessageItem(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

class SessionMessagesResponse(BaseModel):
    session_id: str
    messages: List[MessageItem]
