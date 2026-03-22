#!/usr/bin/env bash
port=${PORT:-8000}
exec uvicorn main:app --host 0.0.0.0 --port "$port"
