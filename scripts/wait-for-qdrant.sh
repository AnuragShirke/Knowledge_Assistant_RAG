#!/bin/sh
# wait-for-qdrant.sh

set -e

host="$1"
shift
cmd="$@"

# Loop until the Qdrant health check endpoint is reachable
until curl -s -f "$host/healthz" > /dev/null; do
  >&2 echo "Qdrant is unavailable - sleeping"
  sleep 1
done

>&2 echo "Qdrant is up - executing command"
    exec "$@"
