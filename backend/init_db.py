# backend/init_db.py
from sqlmodel import SQLModel
from backend.db import engine
from backend.models.Node import Node  # import your model
from backend.models.LatencyHistory import LatencyHistory

def init_db():
    SQLModel.metadata.create_all(engine)

if __name__ == "__main__":
    init_db()