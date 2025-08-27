
# Multi-stage build for Python backend
# Build stage
FROM python:3.11-alpine as builder

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    python3-dev \
    postgresql-dev \
    curl

# Set the working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .

# Create requirements for production (exclude dev dependencies)
RUN grep -v "pytest" requirements.txt > requirements-prod.txt

# Set a higher timeout for pip installations
ENV PIP_DEFAULT_TIMEOUT=1000

# Install dependencies to a local directory
RUN pip install --no-cache-dir --user -r requirements-prod.txt

# Production stage
FROM python:3.11-alpine

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    postgresql-libs \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Set the working directory
WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /root/.local /home/appuser/.local

# Copy the application code
COPY --chown=appuser:appgroup ./src /app/src
COPY --chown=appuser:appgroup ./scripts /app/scripts
COPY --chown=appuser:appgroup ./alembic /app/alembic
COPY --chown=appuser:appgroup ./alembic.ini /app/alembic.ini

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Switch to non-root user
USER appuser

# Ensure user's local bin is in PATH
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Expose port 8000
EXPOSE 8000

# Add health check for database connectivity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Define the command to run the application
CMD ["/app/scripts/init-db.sh"]
