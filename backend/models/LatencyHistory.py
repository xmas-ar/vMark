from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional

class LatencyHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    node_id: str
    timestamp: datetime
    latency_ms: Optional[int]