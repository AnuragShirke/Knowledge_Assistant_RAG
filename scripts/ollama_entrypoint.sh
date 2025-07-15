#!/bin/bash

# Start Ollama in the background
/bin/ollama serve &

# Get the process ID of the server
pid=$!

# Wait for the server to be ready
while ! curl -s -f http://localhost:11434/ > /dev/null; do
  echo "Waiting for Ollama server to start..."
  sleep 1
done

# Pull the model
echo "Ollama server started. Pulling llama3 model..."
ollama pull llama3

# Wait for the background process to exit
wait $pid
