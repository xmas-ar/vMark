import os
VERSION = "v0.1.2"
VMARK_ID = "208f3njq24390uvn3w9pou0rfnv309uvnq0329u4fn029ubnf30129ubc"
HOST_IP = os.environ.get("HOST", "0.0.0.0")

# Remove the specific development IP from the default.
# Keep localhost/127.0.0.1 for potential direct API access during dev/testing if needed.
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173" # Development server defaults
ALLOWED_ORIGINS_STR = os.environ.get("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_STR.split(',') if origin.strip()]
print(f"Config Loaded: HOST_IP={HOST_IP}, ALLOWED_ORIGINS={ALLOWED_ORIGINS}")
