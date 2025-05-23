from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, TYPE_CHECKING, Dict, Any

if TYPE_CHECKING:
    from .Node import Node  # Assuming Node.py is in the same directory (models)

class ELineServiceBase(SQLModel):
    """
    Base model for ELineService, containing common fields.
    """
    name: str = Field(
        primary_key=True, 
        index=True, 
        unique=True, 
        description="Unique user-defined name for the E-Line service (e.g., 'Customer 101 E-Line'). This is the primary key."
    )
    description: Optional[str] = Field(default=None, description="Optional description for the E-Line service.")

    a_node_id: str = Field(foreign_key="node.id", description="ID of Node A.")
    a_iface: str = Field(description="Customer-facing interface on Node A (e.g., 'eth1').")
    a_rule_name: str = Field(description="Name of the eBPF forwarding rule on Node A.")

    # Make Node Z fields optional
    z_node_id: Optional[str] = Field(default=None, foreign_key="node.id", description="ID of Node Z.")
    z_iface: Optional[str] = Field(default=None, description="Customer-facing interface on Node Z (e.g., 'eth2').")
    z_rule_name: Optional[str] = Field(default=None, description="Name of the eBPF forwarding rule on Node Z.")

class ELineService(ELineServiceBase, table=True):
    """
    Database model for ELineService.
    Includes timestamps and relationships to Node models.
    """
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(
        default_factory=datetime.utcnow, 
        nullable=False, 
        sa_column_kwargs={"onupdate": datetime.utcnow}
    )

    # Define relationships to the Node model for easier access to node details
    # The primaryjoin condition explicitly links the foreign key to the Node's primary key.
    a_node: Optional["Node"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "ELineService.a_node_id == Node.id",
            "lazy": "joined" # Or "selectin" for more optimized loading if needed
        }
    )
    z_node: Optional["Node"] = Relationship(
        sa_relationship_kwargs={
            "primaryjoin": "ELineService.z_node_id == Node.id",
            "lazy": "joined"
        }
    )

# Pydantic models for API request and response validation

class ELineServiceCreate(ELineServiceBase):
    """
    Model for creating a new E-Line service. Inherits all fields from ELineServiceBase.
    Timestamps are handled by the database.
    """
    pass

class ForwardingRuleDetails(SQLModel):
    name: str
    in_interface: str
    match_svlan: Optional[int] = Field(default=None)
    match_cvlan: Optional[int] = Field(default=None)
    out_interface: Optional[str] = Field(default=None)
    pop_tags: Optional[int] = Field(default=None)
    push_svlan: Optional[int] = Field(default=None)
    push_cvlan: Optional[int] = Field(default=None)
    active: Optional[bool] = Field(default=None)

    class Config:
        populate_by_name = True # Allows using alias like 'svlan' for 'match_svlan'

class ELineServiceRead(ELineServiceBase):
    """
    Model for reading/returning E-Line service details.
    Includes dynamically determined 'active' status and rule details.
    """
    created_at: datetime
    updated_at: datetime
    
    a_node_ip: Optional[str] = Field(default=None, description="IP address of Node A.")
    z_node_ip: Optional[str] = Field(default=None, description="IP address of Node Z.")
    
    active: bool = Field(default=False, description="Overall status of the E-Line service, true if both rules are active on their respective nodes.")
    
    # These fields will hold the parsed data of the specific rules from each node.
    a_rule_data: Optional[ForwardingRuleDetails] = Field(default=None, description="Details of the rule on Node A.")
    z_rule_data: Optional[ForwardingRuleDetails] = Field(default=None, description="Details of the rule on Node Z.")


class ELineServiceUpdate(SQLModel):
    """
    Model for updating an existing E-Line service.
    All fields are optional. The 'name' (ID) of the service is not updatable.
    """
    description: Optional[str] = None
    a_node_id: Optional[str] = None
    a_iface: Optional[str] = None
    a_rule_name: Optional[str] = None
    z_node_id: Optional[str] = None
    z_iface: Optional[str] = None
    z_rule_name: Optional[str] = None