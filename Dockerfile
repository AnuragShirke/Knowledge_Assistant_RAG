
# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Install curl for the wait script
RUN apt-get update && apt-get install -y curl

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Set a higher timeout for pip installations
ENV PIP_DEFAULT_TIMEOUT=1000

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Ensure Python scripts are in PATH
ENV PATH="/usr/local/bin:${PATH}"

# Copy the application code into the container
COPY ./src /app/src
COPY ./scripts /app/scripts
COPY ./alembic /app/alembic
COPY ./alembic.ini /app/alembic.ini

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Expose port 8000 to allow communication to the Uvicorn server
EXPOSE 8000

# Add health check for database connectivity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Define the command to run the application
# The init-db.sh script will handle database migrations and server startup
CMD ["/app/scripts/init-db.sh"]
