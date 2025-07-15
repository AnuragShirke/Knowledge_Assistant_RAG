#!/bin/bash

# This script automates pulling a model into the Ollama container.

# The name of the model to pull
MODEL_NAME="llama3"

# The name of the ollama service in docker-compose.yml
OLLAMA_SERVICE_NAME="ollama"

# Check if the container is running
if ! docker-compose ps -q $OLLAMA_SERVICE_NAME > /dev/null 2>&1; then
    echo "Ollama container is not running. Please start it with 'docker-compose up -d'"
    exit 1
fi

echo "Pulling the $MODEL_NAME model into the Ollama container..."
echo "This may take a while depending on your internet connection."

docker-compose exec $OLLAMA_SERVICE_NAME ollama pull $MODEL_NAME

echo "Model pull complete."
