from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from ..config import VERSION, VMARK_ID
from ..models.Node import Node
from ..db import get_db
from sqlmodel import Session, select
import httpx

router = APIRouter()

# Add this new endpoint
@router.get("/version")
def get_version():
    """Get the current version of the API"""
    return {"version": VERSION}

@router.get("/nodes")
def get_nodes(db: Session = Depends(get_db)):
    """Get all registered nodes"""
    nodes_from_db = db.exec(select(Node)).all()
    nodes_list = []
    for node in nodes_from_db:
        node_dict = node.dict()
        # Convert comma-separated string back to list
        node_dict["tags"] = node.tags.split(',') if node.tags else []
        nodes_list.append(node_dict)
    return nodes_list

class RegisterNode(BaseModel):
    node_id: str
    ip: str
    tags: List[str] = []  # Rename capabilities to tags, default to empty list
    auth_token: str
    port: int = 1050  # Default port if not provided

@router.post("/register")
async def register_node(node: RegisterNode, db: Session = Depends(get_db)):
    try:
        # Try to validate token with vMark-node
        async with httpx.AsyncClient() as client:
            port = getattr(node, 'port', 1050)
            
            if ":" in node.ip:  # Handle IPv6 format
                target_url = f"http://[{node.ip}]:{port}/register"
            else:
                target_url = f"http://{node.ip}:{port}/register"
                
            print(f"Attempting to connect to: {target_url}")
            
            response = await client.post(
                target_url,
                json={
                    "auth_token": node.auth_token,
                    "vmark_id": VMARK_ID  # Send vMark ID during registration
                },
                timeout=5.0
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail=f"Token validation failed: {response.text}"
                )

        # Continue with node registration
        existing_node = db.query(Node).filter(Node.id == node.node_id).first()
        if existing_node:
            existing_node.ip = node.ip
            existing_node.port = node.port  # Save the port
            existing_node.tags = ",".join(node.tags) if node.tags else "" # Use tags
            existing_node.status = "online"
            existing_node.last_seen = datetime.utcnow()
        else:
            new_node = Node(
                id=node.node_id,
                ip=node.ip,
                port=node.port,  # Save the port
                tags=",".join(node.tags) if node.tags else "", # Use tags
                status="online",
                last_seen=datetime.utcnow()
            )
            db.add(new_node)
        
        db.commit()
        return {"message": "Registration successful", "node_id": node.node_id}

    except httpx.RequestError as e:
        print(f"Connection error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Could not connect to vMark-node: {str(e)}"
        )
    except Exception as e:
        print(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Registration error: {str(e)}"
        )

class UpdateNode(BaseModel):
    """Pydantic model for node update payload"""
    ip: str
    port: int
    tags: List[str] = [] # Rename capabilities to tags
    auth_token: Optional[str] = None # Make token optional for updates

@router.put("/nodes/{node_id}")
async def update_node(node_id: str, node_update: UpdateNode, db: Session = Depends(get_db)):
    """Update an existing node's details"""
    existing_node = db.query(Node).filter(Node.id == node_id).first()
    if not existing_node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Optional: Validate new token if provided
    if node_update.auth_token:
        try:
            async with httpx.AsyncClient() as client:
                port = node_update.port
                if ":" in node_update.ip:  # Handle IPv6 format
                    target_url = f"http://[{node_update.ip}]:{port}/register" # Or a specific validation endpoint?
                else:
                    target_url = f"http://{node_update.ip}:{port}/register"

                print(f"Attempting to validate new token with: {target_url}")
                response = await client.post(
                    target_url,
                    json={
                        "auth_token": node_update.auth_token,
                        "vmark_id": VMARK_ID
                    },
                    timeout=5.0
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=401,
                        detail=f"New token validation failed: {response.text}"
                    )
            # If validation succeeds, you might want to store the new token securely
            # For now, we assume validation means we can proceed with other updates.
            # NOTE: The current Node model doesn't store the token, so this validation
            #       only confirms the node accepts it. You might need to adjust logic
            #       if the central server needs to store/use the token later.
            print("New token validated successfully.")

        except httpx.RequestError as e:
            print(f"Connection error during token validation: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Could not connect to vMark-node to validate token: {str(e)}"
            )
        except Exception as e:
            print(f"Token validation error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Token validation error: {str(e)}"
            )

    # Update node details
    existing_node.ip = node_update.ip
    existing_node.port = node_update.port
    existing_node.tags = ",".join(node_update.tags) if node_update.tags else "" # Use tags
    # Optionally update last_seen or status if needed upon successful update/validation
    # existing_node.last_seen = datetime.utcnow()

    try:
        db.add(existing_node) # Add the updated instance
        db.commit()
        db.refresh(existing_node) # Refresh to get updated state if needed
        # Manually convert comma-separated string back to list for the response
        response_node_dict = existing_node.dict()
        response_node_dict["tags"] = existing_node.tags.split(',') if existing_node.tags else []
        return {"message": "Node updated successfully", "node": response_node_dict}
    except Exception as e:
        db.rollback()
        print(f"Database error during update: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update node in database: {str(e)}")

@router.delete("/nodes/{node_id}")
def delete_node(node_id: str, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    db.delete(node)
    db.commit()
    return {"message": "Node deleted successfully"}
