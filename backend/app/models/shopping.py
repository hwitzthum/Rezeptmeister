import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="SET NULL"))
    ingredient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float | None] = mapped_column(DECIMAL(10, 3))
    unit: Mapped[str | None] = mapped_column(String(50))
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aisle_category: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)