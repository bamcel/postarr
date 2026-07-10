# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React/Vite frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build/frontend

# Install deps first (cached unless package*.json changes).
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build the SPA -> /build/frontend/dist
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python runtime that serves the API + the built SPA
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    POSTARR_DATA_DIR=/data

WORKDIR /app/backend

# Backend dependencies (cached unless requirements.txt changes).
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# Backend source.
COPY backend/ ./

# Place the built SPA where the backend expects it (BACKEND_DIR/../frontend/dist).
COPY --from=frontend /build/frontend/dist /app/frontend/dist

# The app process itself runs as this non-root user; /data holds the SQLite
# db + encryption key. The container still starts as root (no USER here) so
# the entrypoint can fix /data's ownership at runtime before dropping to it
# — see docker-entrypoint.sh for why that's necessary on top of this bake-in.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin postarr \
    && mkdir -p /data \
    && chown -R postarr:postarr /data /app

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data"]
EXPOSE 7979

# Lightweight healthcheck using only the stdlib (no curl in slim image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:7979/api/health').status==200 else 1)"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "run.py"]
