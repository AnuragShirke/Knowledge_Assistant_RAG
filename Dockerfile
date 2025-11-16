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

# --- TEMPORARY DEBUGGING STEP ---
# We will install pip and then run a command to get the exact platform tag.
RUN python -m ensurepip
RUN pip install --upgrade pip
RUN pip debug --verbose

# The build will stop here for now.
CMD ["echo", "Debugging complete. Check logs for platform info."]