
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

# Copy the application code into the container
COPY ./src /app/src
COPY ./scripts /app/scripts

# Expose port 8000 to allow communication to the Uvicorn server
EXPOSE 8000

# Define the command to run the application
# --host 0.0.0.0 makes the server accessible from outside the container
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
