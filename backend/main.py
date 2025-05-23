from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.api.routes import router as api_router
from backend.api.latency import router as latency_router
from backend.heartbeat import heartbeat_loop
from .db import get_db
from .models.eline_service import ELineService
from sqlmodel import Session, select
import asyncio
import os
import backend.config as config
import httpx
import json


app = FastAPI()

app.include_router(api_router, prefix="/api")
app.include_router(latency_router, prefix="/api")

STATIC_FILES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

app.mount("/", StaticFiles(directory=STATIC_FILES_DIR, html=True), name="static-root")

allowed_origins = config.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins, # Use the imported config value
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def check_rule_active(node_id: str, rule_name: str) -> bool:
    # Ajusta la URL y el método según tu API real
    from backend.models.Node import Node
    from .db import get_db
    with Session(get_db()) as db:
        node = db.get(Node, node_id)
        if not node:
            return False
        url = f"http://{node.ip}:{node.port}/execute"
        payload = {"command": "xdp-switch show-forwarding json"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(url, json=payload)
                res.raise_for_status()
                data = res.json()
                rules = []
                if data.get("output") and isinstance(data["output"].get("table"), str):
                    rules = json.loads(data["output"]["table"])
                elif data.get("output") and isinstance(data["output"].get("table"), list):
                    rules = data["output"]["table"]
                rule = next((r for r in rules if r.get("name") == rule_name), None)
                return bool(rule and rule.get("active"))
        except Exception as e:
            print(f"[CHECK RULE ERROR] Node {node_id}: {e}")
            return False

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(heartbeat_loop())