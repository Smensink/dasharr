#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions
mkdir -p /app/data
chown -R nodejs:nodejs /app/data

# Switch to nodejs user and run the app
exec su-exec nodejs "$@"
