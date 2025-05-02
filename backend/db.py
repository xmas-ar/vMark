from sqlmodel import create_engine, Session
from backend.models.Node import Node

SQLALCHEMY_DATABASE_URL = "sqlite:///./vmark.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

def get_db():
    with Session(engine) as session:
        yield session
