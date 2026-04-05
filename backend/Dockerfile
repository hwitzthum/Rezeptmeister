FROM python:3.12-slim

WORKDIR /app

# uv installieren
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Abhängigkeiten zuerst (Layer-Caching)
COPY pyproject.toml .
RUN uv sync --no-dev

# Anwendungscode
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]