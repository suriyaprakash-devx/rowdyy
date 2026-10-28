# ==========================================
# Stage 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Support optional external API URL at build time (defaults to relative /api for unified hosting)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Copy frontend package descriptors and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and compile production bundle
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Container (Python FastAPI)
# ==========================================
FROM python:3.11-slim

# Prevent Python from buffering stdout/stderr and writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    ENVIRONMENT=production

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase, universe data, and documentation
COPY backend/ ./backend/
COPY data/ ./data/
COPY README.md ./

# Copy compiled frontend assets from Stage 1 into frontend/dist for FastAPI SPA serving
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose container port
EXPOSE 8000

# Health check to ensure FastAPI service is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start FastAPI application with Uvicorn
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
