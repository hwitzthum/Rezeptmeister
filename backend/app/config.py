from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from functools import lru_cache
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://rezeptmeister:localdev@localhost:5432/rezeptmeister"
    upload_dir: str = "./uploads"
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_mime_types: list[str] = ["image/jpeg", "image/png", "image/webp"]
    thumbnail_size: tuple[int, int] = (300, 300)

    # Internal token – Next.js proxy must send this in X-Internal-Token header.
    # Required in all environments. Generate with: openssl rand -hex 32
    internal_secret: str = ""

    # Gemini model names (configurable for future upgrades)
    gemini_embedding_model: str = "gemini-embedding-2-preview"
    gemini_ocr_model: str = "gemini-3.1-pro-preview"
    gemini_flash_model: str = "gemini-2.5-flash"
    gemini_image_gen_model: str = "gemini-2.5-flash-image"

    # Debug-Modus: aktiviert /docs, /redoc, /openapi.json
    debug: bool = False

    # Environment name – used for production guards
    environment: str = "development"

    # Supabase Storage – for downloading and uploading images
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "recipe-images"

    # CORS – stored as str to avoid pydantic-settings JSON-decode issues.
    # Accepts: JSON array, comma-separated, or empty (uses default).
    cors_origins_raw: str = "http://localhost:3001"

    @property
    def cors_origins(self) -> list[str]:
        v = self.cors_origins_raw.strip()
        if not v:
            return ["http://localhost:3001"]
        if v.startswith("["):
            return json.loads(v)
        return [o.strip() for o in v.split(",") if o.strip()]

    @model_validator(mode="after")
    def check_cors_no_wildcard(self) -> "Settings":
        if "*" in self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS_RAW must not contain '*' when allow_credentials=True. "
                "Specify explicit origins, e.g. https://example.com"
            )
        return self

    @model_validator(mode="after")
    def check_internal_secret(self) -> "Settings":
        if not self.internal_secret or len(self.internal_secret) < 32:
            raise ValueError(
                "INTERNAL_SECRET must be at least 32 characters. "
                "Generate with: openssl rand -hex 32"
            )
        return self

    @model_validator(mode="after")
    def check_debug_in_production(self) -> "Settings":
        if self.environment.lower() == "production" and self.debug:
            raise ValueError(
                "debug=True is not allowed when ENVIRONMENT=production. "
                "Set debug=False or change ENVIRONMENT."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
