from fastapi import APIRouter, Depends, HTTPException, Query # Import Query
from sqlmodel import Session, select
from datetime import datetime, timedelta, timezone # Import datetime components
from backend.db import get_db
from backend.models.LatencyHistory import LatencyHistory

router = APIRouter()

@router.get("/nodes/{node_id}/latency")
def get_latency_history(
    node_id: str,
    hours: int = Query(24, ge=1, le=168), # Add hours parameter (default 24, min 1, max 168=7days)
    db: Session = Depends(get_db)
):
    # Calculate the cutoff time based on the hours parameter
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)

    results = db.exec(
        select(LatencyHistory)
        .where(LatencyHistory.node_id == node_id)
        .where(LatencyHistory.timestamp >= cutoff_time) # Filter by timestamp
        .order_by(LatencyHistory.timestamp.asc())
    ).all()

    # Return empty list if no results found for the period
    if not results:
        return []

    return [
        {"time": lh.timestamp.isoformat(), "latency": lh.latency_ms}
        for lh in results
    ]