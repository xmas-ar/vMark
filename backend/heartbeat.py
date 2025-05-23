import asyncio
import httpx
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select, delete
from collections import deque

from backend.db import engine
from backend.models.Node import Node
from backend.models.LatencyHistory import LatencyHistory
from backend.config import VMARK_ID

HEARTBEAT_INTERVAL = 1  # seconds
RETENTION_HOURS = 24
API_TIMEOUT = 2  # seconds timeout for API requests

# Function to add latency data for a node
def add_latency(node_id: str, latency: float):
    if node_id not in node_latency_data:
        node_latency_data[node_id] = deque(maxlen=5)  # Store the last 5 latency readings
    node_latency_data[node_id].append(latency)

# Create a deque to store latency values for each node for the last 5 minutes
node_latency_data = {}

# Function to calculate the average latency from the last 5 values
def calculate_average_latency(node_id: str) -> float:
    if node_id in node_latency_data and node_latency_data[node_id]:
        return sum(node_latency_data[node_id]) / len(node_latency_data[node_id])
    return None  # If no data available, return None

async def check_node_status(ip: str, port: int) -> tuple[bool, float]:
    """
    Check if a vMark-node is online by sending an API request
    Returns (is_online, latency_in_ms)
    """
    try:
        # Format URL based on IP address format
        if ":" in ip:  # IPv6
            url = f"http://[{ip}]:{port}/api/heartbeat"
        else:  # IPv4
            url = f"http://{ip}:{port}/api/heartbeat"
        
        # Start timing the request
        start_time = datetime.now()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"vmark_id": VMARK_ID},  # Send the vMark ID for authentication
                timeout=API_TIMEOUT
            )
            
            # Calculate elapsed time
            elapsed_time = datetime.now() - start_time
            latency_ms = elapsed_time.total_seconds() * 1000
            
            if response.status_code == 200:
                return True, round(latency_ms)
            else:
                return False, 0
    except Exception as e:
        print(f"[API REQUEST ERROR] {ip}:{port} - {e}")
        return False, 0

async def heartbeat_loop():
    while True:
        try:
            with Session(engine) as session:
                nodes = session.exec(select(Node)).all()
                now = datetime.now(timezone.utc)

                for node in nodes:
                    # Extract port from node data or use default
                    port = node.port if hasattr(node, 'port') and node.port else 3000
                    
                    # Check node status using API request
                    is_online, latency_ms = await check_node_status(node.ip, port)
                    
                    # Always create a history entry, use None for latency if offline
                    avg_latency = None
                    if is_online:
                        add_latency(node.id, latency_ms)
                        avg_latency = calculate_average_latency(node.id)
                        node.status = "online"
                        node.last_seen = now  # <--- Solo aquí
                    else:
                        if node.id in node_latency_data:
                            node_latency_data[node.id].clear()
                        node.status = "offline"
                        # NO actualizar node.last_seen aquí
                    
                    # Save the latency history entry (average if online, None if offline)
                    entry = LatencyHistory(
                        node_id=node.id,
                        timestamp=now,
                        # Use avg_latency if calculated, otherwise use raw latency_ms if online, else None
                        latency_ms=avg_latency if avg_latency is not None else (latency_ms if is_online else None)
                    )
                    session.add(entry)
                    
                # Delete old data
                cutoff = now - timedelta(hours=RETENTION_HOURS)
                session.exec(delete(LatencyHistory).where(LatencyHistory.timestamp < cutoff))

                session.commit()
        except Exception as e:
            print("[HEARTBEAT ERROR]", e)

        await asyncio.sleep(HEARTBEAT_INTERVAL)  # Wait before the next check
