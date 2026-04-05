from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://rezeptmeister:localdev@localhost:5432/rezeptmeister"
    upload_dir: str = "./uploads"
    max_upload_size_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_mime_types: list[str] = ["image/jpeg", "image/png", "image/webp"]
    thumbnail_size: tuple[int, int] = (300, 300)

    # Internal token – Next.js proxy must send this in X-Internal-Token header.
    # Leave empty in development to disable the check.
    internal_secret: str = ""

    # Gemini model names (configurable for future upgrades)
    gemini_embedding_model: str = "gemini-embedding-2-preview"
    gemini_ocr_model: str = "gemini-3.1-pro-preview"
    gemini_flash_model: str = "gemini-2.5-flash"
    gemini_image_gen_model: str = "gemini-2.5-flash-image"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
