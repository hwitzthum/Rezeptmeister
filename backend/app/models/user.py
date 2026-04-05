import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(SAEnum("admin", "user", name="user_role"), default="user", nullable=False)
    status: Mapped[str] = mapped_column(SAEnum("pending", "approved", "rejected", name="user_status"), default="pending", nullable=False)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    api_provider: Mapped[str | None] = mapped_column(String(50))
    preferred_servings: Mapped[int] = mapped_column(Integer, default=4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))