from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.api.routes import router as api_router
from backend.api.latency import router as latency_router
from backend.heartbeat import heartbeat_loop
import asyncio
import os
import backend.config as config


app = FastAPI()
app.include_router(api_router, prefix="/api")
app.include_router(latency_router, prefix="/api")

STATIC_FILES_DIR = os.path.join(os.path.dirname(__file__), "frontend/dist")

app.mount("/", StaticFiles(directory=STATIC_FILES_DIR, html=True), name="static-root")

allowed_origins = config.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins, # Use the imported config value
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(heartbeat_loop())