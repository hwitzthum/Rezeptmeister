from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from functools import lru_cache


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

    # CORS – accepts a JSON array or a comma-separated string
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["http://localhost:3000"]
            if not v.startswith("["):
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
