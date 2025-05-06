from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from datetime import datetime, timedelta, timezone
from backend.db import get_db
from backend.models.LatencyHistory import LatencyHistory
from typing import List, Dict, Any, Optional

router = APIRouter()

@router.get("/nodes/{node_id}/latency", response_model=List[Dict[str, Any]])
def get_latency_history(
    node_id: str,
    hours: int = Query(24, ge=1, le=168),
    interval: Optional[str] = Query(None, description="Aggregation interval (e.g., 'minute')"),
    db: Session = Depends(get_db)
):
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)

    if interval == 'minute':
        # Use strftime for SQLite compatibility to truncate to the minute
        # The format '%Y-%m-%dT%H:%M:00Z' effectively truncates seconds and microseconds
        minute_col = func.strftime('%Y-%m-%dT%H:%M:00Z', LatencyHistory.timestamp).label("minute_interval_str")
        avg_latency_col = func.avg(LatencyHistory.latency_ms).label("avg_latency")

        statement = (
            select(minute_col, avg_latency_col)
            .where(LatencyHistory.node_id == node_id)
            .where(LatencyHistory.timestamp >= cutoff_time)
            .where(LatencyHistory.latency_ms.is_not(None))
            .group_by(minute_col) # Group by the same strftime expression
            .order_by(minute_col.asc()) # Order by the truncated time string
        )
        results = db.exec(statement).all()

        # Format aggregated results - the time is already an ISO-like string from strftime
        return [
            {"time": row.minute_interval_str, "latency_ms": row.avg_latency} # <--- CHANGE 'latency' TO 'latency_ms'
            for row in results if row.minute_interval_str
        ]

    else:
        # Fetch raw data (original behavior)
        statement = (
            select(LatencyHistory)
            .where(LatencyHistory.node_id == node_id)
            .where(LatencyHistory.timestamp >= cutoff_time)
            .order_by(LatencyHistory.timestamp.asc())
        )
        results = db.exec(statement).all()

        if not results:
            return []

        # Format raw results
        return [
            {"time": lh.timestamp.isoformat() + "Z", "latency_ms": lh.latency_ms} # Already correct here
            for lh in results
        ]