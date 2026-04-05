import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Boolean, DateTime, Enum as SAEnum, ForeignKey, ARRAY, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from app.database import Base


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    servings: Mapped[int] = mapped_column(Integer, nullable=False)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer)
    cook_time_minutes: Mapped[int | None] = mapped_column(Integer)
    total_time_minutes: Mapped[int | None] = mapped_column(Integer)
    difficulty: Mapped[str | None] = mapped_column(
        SAEnum("einfach", "mittel", "anspruchsvoll", name="recipe_difficulty")
    )
    source_type: Mapped[str] = mapped_column(
        SAEnum("manual", "image_ocr", "url_import", "ai_generated", "web_search", name="recipe_source_type"),
        default="manual",
        nullable=False,
    )
    source_url: Mapped[str | None] = mapped_column(Text)
    source_image_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="SET NULL"))
    cuisine: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(100))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(3072))
    nutrition_info: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float | None] = mapped_column(DECIMAL(10, 3))
    unit: Mapped[str | None] = mapped_column(String(50))
    group_name: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class RecipeNote(Base):
    __tablename__ = "recipe_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    note_type: Mapped[str] = mapped_column(
        SAEnum("tipp", "variation", "erinnerung", "bewertung", "allgemein", name="note_type"),
        default="allgemein",
        nullable=False,
    )
    rating: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))