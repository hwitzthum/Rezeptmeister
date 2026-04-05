"""Add halfvec HNSW indexes for recipe and image embeddings

Revision ID: 0001
Revises: –
Create Date: 2026-04-05

Verwendet halfvec(3072) Cast um das HNSW-Limit von 2000 Dimensionen zu umgehen.
gemini-embedding-2-preview erzeugt 3072-dimensionale Vektoren, die für HNSW
als 16-Bit-Halbgenauigkeit gespeichert werden (50% Platzeinsparung, vernachlässigbarer
Qualitätsverlust für semantische Suche).
"""

from alembic import op

revision: str = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_recipes_embedding_hnsw
        ON recipes
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_images_embedding_hnsw
        ON images
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_recipes_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_images_embedding_hnsw")
