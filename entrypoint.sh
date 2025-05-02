#!/bin/bash
set -e

# Run the Python script/function to initialize the database
# Replace 'backend.database:init_db' with the actual module and function
# that contains your SQLModel.metadata.create_all(engine) call.
echo "Initializing database..."
python -c "from backend.init_db import init_db; init_db()"

echo "Starting application..."
# Execute the uvicorn command passed as arguments to this script
# Or directly run uvicorn if CMD is removed from Dockerfile
exec uvicorn backend.main:app --host 0.0.0.0 --port 8000