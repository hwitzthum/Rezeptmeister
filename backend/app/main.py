from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from contextlib import asynccontextmanager

from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Rezeptmeister API",
    description="KI-Pipeline für Rezeptmeister – Embeddings, OCR, KI-Funktionen",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InternalTokenMiddleware(BaseHTTPMiddleware):
    """Require X-Internal-Token on all routes except /health when internal_secret is set."""

    async def dispatch(self, request: Request, call_next):
        if settings.internal_secret and request.url.path != "/health":
            token = request.headers.get("X-Internal-Token")
            if token != settings.internal_secret:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


app.add_middleware(InternalTokenMiddleware)


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": "rezeptmeister-backend"}