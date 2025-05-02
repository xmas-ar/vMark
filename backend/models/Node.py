from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional

class Node(SQLModel, table=True):
    id: str = Field(default=None, primary_key=True)
    ip: str
    port: Optional[int] = None
    status: str = "offline"
    tags: Optional[str] = None
    last_seen: Optional[datetime] = None

    def capabilities_list(self):
        return self.tags.split(",") if self.tags else []


# Revision identifiers, used by Alembic
revision = 'add_port_to_node'
down_revision = 'previous_revision_id'
branch_labels = None
depends_on = None

def upgrade():
    # Add the 'port' column to the 'node' table
    op.add_column('node', sa.Column('port', sa.Integer(), nullable=False, server_default="1050"))

def downgrade():
    # Remove the 'port' column from the 'node' table
    op.drop_column('node', 'port')
