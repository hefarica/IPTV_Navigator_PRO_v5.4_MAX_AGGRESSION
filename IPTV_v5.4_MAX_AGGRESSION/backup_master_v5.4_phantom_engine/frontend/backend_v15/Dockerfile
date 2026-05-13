# ============================================================================
# APE v15 ULTIMATE - Multi-stage Dockerfile
# ============================================================================
# Optimized Python container for production deployment
# Version: 15.0.1-ULTIMATE
# ============================================================================

# Stage 1: Builder - Install dependencies
FROM python:3.11-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============================================================================
# Stage 2: Production - Minimal runtime image
# ============================================================================
FROM python:3.11-slim as production

# Labels
LABEL maintainer="APE Team"
LABEL version="15.0.1-ULTIMATE"
LABEL description="APE v15 ULTIMATE Backend - Flask + Redis IPTV Streaming Middleware"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    APE_HOST=0.0.0.0 \
    APE_PORT=8080

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN groupadd --gid 1000 ape && \
    useradd --uid 1000 --gid ape --shell /bin/bash --create-home ape

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=ape:ape ape_server_v15_ultimate.py .
COPY --chown=ape:ape telemetry_v15.py .
COPY --chown=ape:ape hysteresis_controller.py .
COPY --chown=ape:ape profile_processor_v15.py .
COPY --chown=ape:ape buffer_optimizer_v15.py .
COPY --chown=ape:ape hls_rewriter_v15.py .
COPY --chown=ape:ape device_metrics.py .
COPY --chown=ape:ape config/ ./config/

# Create directories for logs and ensure proper permissions
RUN mkdir -p /app/logs && chown -R ape:ape /app

# Copy utils if exists
COPY --chown=ape:ape utils/ ./utils/ 2>/dev/null || true

# Switch to non-root user
USER ape

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["python", "ape_server_v15_ultimate.py"]
