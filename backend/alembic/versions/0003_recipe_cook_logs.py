"""add recipe_cook_logs table (Phase 21 Kochhistorie)

Revision ID: 0003_recipe_cook_logs
Revises: dd2c268a7fd1
Create Date: 2026-08-30

Spiegelt frontend/drizzle/0005_recipe_cook_logs.sql. Die Drizzle-Seite ist
die Quelle der Wahrheit; diese Revision haelt Alembic synchron.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_recipe_cook_logs"
down_revision: Union[str, None] = "dd2c268a7fd1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recipe_cook_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("recipe_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("cooked_on", sa.Date(), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "idx_recipe_cook_logs_recipe",
        "recipe_cook_logs",
        ["user_id", "recipe_id", "cooked_on"],
        if_not_exists=True,
    )
    op.create_index(
        "idx_recipe_cook_logs_user_date",
        "recipe_cook_logs",
        ["user_id", "cooked_on"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("idx_recipe_cook_logs_user_date", table_name="recipe_cook_logs")
    op.drop_index("idx_recipe_cook_logs_recipe", table_name="recipe_cook_logs")
    op.drop_table("recipe_cook_logs")
