# Stage 1: Builder
# Use a standard Debian-based image which has better compatibility for wheels
FROM python:3.11-slim-bookworm as builder

# Install build dependencies
# We use apt-get instead of apk
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Create requirements for production (exclude dev dependencies)
RUN grep -v "pytest" requirements.txt > requirements-prod.txt

# Set a higher timeout for pip installations
ENV PIP_DEFAULT_TIMEOUT=1000

# Install dependencies to a local directory
RUN pip install --no-cache-dir --user -r requirements-prod.txt


# Stage 2: Final Production Image
FROM python:3.11-slim-bookworm

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    libpq5 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN addgroup --system appgroup --gid 1001 && \
    adduser --system appuser --uid 1001 --ingroup appgroup

WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /root/.local /home/appuser/.local

# Copy the application code
COPY --chown=appuser:appgroup ./src /app/src
COPY --chown=appuser:appgroup ./scripts /app/scripts
COPY --chown=appuser:appgroup ./alembic /app/alembic
COPY --chown=appuser:appgroup ./alembic.ini /app/alembic.ini

# Grant ownership of home directory to appuser
RUN chown -R appuser:appgroup /home/appuser

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Switch to non-root user
USER appuser

# Ensure user's local bin is in PATH
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Expose port 8000
EXPOSE 8000

# Define the command to run the application
# This will be overridden by the command in Hugging Face settings, but it's good practice to have it.
CMD ["/app/scripts/init-db.sh"]
