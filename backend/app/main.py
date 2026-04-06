from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from contextlib import asynccontextmanager

from app.config import get_settings
from app.routers import admin as admin_router
from app.routers import embed as embed_router
from app.routers import ocr as ocr_router
from app.routers import search as search_router
from app.routers import ai as ai_router
from app.routers import import_router
from app.routers import web_search as web_search_router

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


_TOKEN_EXEMPT = {"/health", "/docs", "/redoc", "/openapi.json"}


class InternalTokenMiddleware(BaseHTTPMiddleware):
    """Require X-Internal-Token on all routes except health/docs when internal_secret is set."""

    async def dispatch(self, request: Request, call_next):
        if settings.internal_secret and request.url.path not in _TOKEN_EXEMPT:
            token = request.headers.get("X-Internal-Token")
            if token != settings.internal_secret:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


app.add_middleware(InternalTokenMiddleware)


app.include_router(admin_router.router)
app.include_router(embed_router.router)
app.include_router(ocr_router.router)
app.include_router(search_router.router)
app.include_router(ai_router.router, prefix="/ai", tags=["AI"])
app.include_router(import_router.router, prefix="/import", tags=["Import"])
app.include_router(web_search_router.router, prefix="/search", tags=["WebSearch"])


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": "rezeptmeister-backend"}