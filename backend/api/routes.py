import logging
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any
from ..config import VERSION, VMARK_ID
from ..models.Node import Node
from ..db import get_db
from sqlmodel import Session, select
import httpx
import json
import asyncio

# --- Add Logging Setup ---
log = logging.getLogger(__name__)
# Ensure FastAPI/Uvicorn configures the root logger appropriately
# If running standalone, you might need more setup:
# logging.basicConfig(level=logging.INFO)
# --- End Logging Setup ---

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

class ExecuteCommandPayload(BaseModel):
    """Payload for executing a command on a node."""
    command: str
    # vmark_id is optional here, as the backend will use its own ID to talk to the node
    vmark_id: Optional[str] = None

@router.post("/nodes/{node_id}/execute")
async def execute_node_command(
    node_id: str,
    payload: ExecuteCommandPayload,
    db: Session = Depends(get_db)
):
    """
    Relay a command execution request to a specific vMark-node.
    """
    # 1. Find the node in the database
    node = db.exec(select(Node).where(Node.id == node_id)).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    if not node.port:
         raise HTTPException(status_code=400, detail=f"Node '{node_id}' does not have a configured port.")

    # 2. Construct the target URL for the node's API
    node_ip = node.ip
    node_port = node.port
    if ":" in node_ip: # IPv6
        target_url = f"http://[{node_ip}]:{node_port}/api/execute"
    else: # IPv4
        target_url = f"http://{node_ip}:{node_port}/api/execute"

    # 3. Prepare the payload for the node
    #    IMPORTANT: Use the backend's VMARK_ID to authenticate with the node
    node_payload = {
        "command": payload.command,
        "vmark_id": VMARK_ID
    }

    # 4. Forward the request to the node
    try:
        async with httpx.AsyncClient() as client:
            print(f"Relaying command to {target_url}: {payload.command}") # Debug print
            response = await client.post(
                target_url,
                json=node_payload,
                timeout=30.0 # Allow a longer timeout for potentially long commands
            )

            # Check if the node responded successfully (even if command execution failed)
            response.raise_for_status() # Raise HTTPError for 4xx/5xx responses

            # 5. Return the node's response (which should contain the command output)
            node_response_data = response.json()
            print(f"Node response: {node_response_data}") # Debug print
            return node_response_data # Forward the whole JSON response

    except httpx.RequestError as e:
        error_detail = f"Could not connect to node '{node_id}' at {target_url}: {str(e)}"
        print(f"Error: {error_detail}") # Debug print
        raise HTTPException(status_code=502, detail=error_detail) # Bad Gateway
    except httpx.HTTPStatusError as e:
        # Handle non-2xx responses from the node API
        error_detail = f"Node '{node_id}' API error: {e.response.status_code} - {e.response.text}"
        print(f"Error: {error_detail}") # Debug print
        # Try to return the node's error output if possible, otherwise raise generic error
        try:
            node_error_data = e.response.json()
            # Return the node's error structure, but use the node's status code
            raise HTTPException(status_code=e.response.status_code, detail=node_error_data)
        except json.JSONDecodeError:
             # If the node's error response wasn't JSON
             raise HTTPException(status_code=e.response.status_code, detail=error_detail)
    except Exception as e:
        error_detail = f"An unexpected error occurred while communicating with node '{node_id}': {str(e)}"
        print(f"Error: {error_detail}") # Debug print
        raise HTTPException(status_code=500, detail=error_detail)

# --- NEW ROUTE for TWAMP Status/Results ---
@router.get("/nodes/{node_id}/twamp/status", tags=["TWAMP"])
async def get_twamp_sender_status(
    node_id: str,
    ip_version: str = Query(..., description="IP version used for the test ('ipv4' or 'ipv6')"),
    dest_ip: str = Query(..., description="Destination IP address of the sender test"),
    port: int = Query(..., description="Destination port of the sender test"),
    db: Session = Depends(get_db) # Add DB dependency
):
    """
    Check the status or retrieve results of a background TWAMP sender test by querying the node.
    """
    log.info(f"Received status request for TWAMP sender on node {node_id} to {dest_ip}:{port} ({ip_version})")

    # Validate ip_version
    if ip_version not in ['ipv4', 'ipv6']:
        raise HTTPException(status_code=400, detail="Invalid ip_version. Use 'ipv4' or 'ipv6'.")

    # --- Find the node to get its IP and Port ---
    node = db.exec(select(Node).where(Node.id == node_id)).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    if not node.port:
         raise HTTPException(status_code=400, detail=f"Node '{node_id}' does not have a configured port.")
    # --- End Find Node ---

    # Construct the command string for the agent
    command_string = f"twamp {ip_version} status sender destination-ip {dest_ip} port {port}"

    # --- Prepare to call the node's /execute endpoint ---
    node_ip = node.ip
    node_port = node.port
    if ":" in node_ip: # IPv6
        target_url = f"http://[{node_ip}]:{node_port}/api/execute"
    else: # IPv4
        target_url = f"http://{node_ip}:{node_port}/api/execute"

    node_payload = {
        "command": command_string,
        "vmark_id": VMARK_ID # Authenticate with the node
    }
    # --- End Preparation ---

    try:
        # --- Execute the status command via the node's API ---
        async with httpx.AsyncClient() as client:
            log.debug(f"Sending status command to {target_url}: {command_string}")
            response = await client.post(
                target_url,
                json=node_payload,
                timeout=10.0 # Timeout for status check
            )
            response.raise_for_status() # Raise HTTPError for 4xx/5xx
            result_data = response.json()
        # --- End Execute via API ---

        log.debug(f"Result from node {node_id} status command: {result_data}")

        # The node's /api/execute endpoint should return a JSON object.
        # If the command itself failed on the node, the node should return a non-200 status
        # or include an 'error' field in its JSON response.
        # We rely on raise_for_status() and the node's response structure.

        # Assuming the node returns {"output": <handler_result>} on success
        # and raises HTTP error or returns {"error": ...} on failure.
        if isinstance(result_data, dict) and "output" in result_data:
             # The actual result from the twamp.handle function is likely in the 'output' field
             handler_output = result_data["output"]

             # Now, check the format of the handler_output
             if isinstance(handler_output, dict) and handler_output.get("error"):
                 status_code = 404 if "No active sender found" in handler_output["error"] else 400
                 raise HTTPException(status_code=status_code, detail=handler_output["error"])
             elif isinstance(handler_output, str) and handler_output.lower().startswith("error"):
                 raise HTTPException(status_code=400, detail=handler_output)
             elif not isinstance(handler_output, dict) or "status" not in handler_output:
                 log.error(f"Unexpected format in 'output' from node's twamp status handler: {handler_output}")
                 raise HTTPException(status_code=500, detail="Internal server error: Invalid status response format from node.")
             else:
                 # Success - return the dictionary from the handler_output
                 return handler_output
        else:
             # If the node's response doesn't contain "output" as expected
             log.error(f"Unexpected response structure from node {node_id}: {result_data}")
             raise HTTPException(status_code=500, detail="Internal server error: Unexpected response structure from node.")

    except httpx.RequestError as e:
        error_detail = f"Could not connect to node '{node_id}' at {target_url} for status check: {str(e)}"
        log.error(error_detail)
        raise HTTPException(status_code=502, detail=error_detail) # Bad Gateway
    except httpx.HTTPStatusError as e:
        # Handle non-2xx responses from the node API during the status check
        error_detail = f"Node '{node_id}' API error during status check: {e.response.status_code} - {e.response.text}"
        log.error(error_detail)
        try:
            node_error_data = e.response.json()
            raise HTTPException(status_code=e.response.status_code, detail=node_error_data)
        except json.JSONDecodeError:
             raise HTTPException(status_code=e.response.status_code, detail=error_detail)
    except HTTPException as http_exc:
        # Re-raise FastAPI HTTP exceptions (like the ones raised after checking handler_output)
        raise http_exc
    except Exception as e:
        log.exception(f"Error processing TWAMP status request for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error processing status request: {e}")

# --- End New Route ---
