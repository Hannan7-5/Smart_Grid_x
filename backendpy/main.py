import json
import asyncio
import logging
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

# --- DATABASE SETUP ---
# NOTE: You MUST replace this with your actual Neon connection string.
# Format: postgresql+asyncpg://[user]:[password]@[host]:[port]/[database]
NEON_DATABASE_URL = "postgresql+asyncpg://user:password@host:port/database" 

# You would typically set up your ORM or connection pool here (e.g., SQLAlchemy/asyncpg)
# For this quick test, we will use a simplified placeholder function.

async def save_to_db(data: dict):
    """
    Placeholder function to simulate saving data to Neon DB.
    In a full app, you would use an async PostgreSQL library (like asyncpg) here.
    """
    try:
        # 1. Connect to DB (using placeholder print for now)
        # conn = await asyncpg.connect(NEON_DATABASE_URL)
        
        # 2. Execute INSERT (Example SQL for a 'readings' table)
        # await conn.execute(
        #     'INSERT INTO readings(timestamp, voltage, current, energy) VALUES($1, $2, $3, $4)',
        #     datetime.now().isoformat(), data["voltage"], data["current"], data["energy"]
        # )
        
        # 3. Close connection
        # await conn.close()
        
        logger.info(f"DB PLACEHOLDER: Data ready to save: V={data['voltage']:.1f}, E={data['energy']:.3f} kWh")
        
    except Exception as e:
        # Catch connection/insertion errors
        logger.error(f"DB Save Error (Check NEON_DATABASE_URL and table schema): {e}")


# --- FASTAPI APP SETUP ---
app = FastAPI(title="Smart Gridx Simplified Backend")

# Allow CORS for React Frontend (Update origins if needed)
origins = [
    "http://localhost:5173",          # Local Development
    "https://YOUR_RENDER_HOSTNAME_HERE" # Replace with your deployed frontend URL
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For simplicity, allowing all during initial setup
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SmartGridx")

# ================= SIMPLIFIED STATE MANAGEMENT =================
# We only track the pole node
system_state = {
    "pole": {
        "connected": False,
        "voltage": 0.0,
        "current": 0.0,
        "power": 0.0,
        "energy": 0.0,
        "last_seen": None
    },
    "alerts": {
        "message": "Waiting for Node Connection"
    }
}

# ================= WEBSOCKET MANAGER =================
class ConnectionManager:
    def __init__(self):
        self.frontend_connections: List[WebSocket] = []
        # We only track the 'pole' hardware connection
        self.hardware_connections: Dict[str, WebSocket] = {}

    async def connect_frontend(self, websocket: WebSocket):
        await websocket.accept()
        self.frontend_connections.append(websocket)
        logger.info("New Frontend Connected")

    def disconnect_frontend(self, websocket: WebSocket):
        if websocket in self.frontend_connections:
            self.frontend_connections.remove(websocket)

    async def connect_hardware(self, websocket: WebSocket, device_type: str):
        # We only expect 'pole'
        if device_type == "pole":
            await websocket.accept()
            self.hardware_connections[device_type] = websocket
            logger.info(f"Hardware Connected: {device_type}")
            
            # Update connection status
            system_state["pole"]["connected"] = True
            await self.broadcast_state()

    def disconnect_hardware(self, device_type: str):
        if device_type in self.hardware_connections:
            del self.hardware_connections[device_type]
            
        if device_type == "pole":
            system_state["pole"]["connected"] = False
            logger.info("Pole Node Disconnected")
            
        # Update system message immediately after disconnect
        self.update_system_logic()

    async def broadcast_state(self):
        # Send full system state to all frontends
        payload = json.dumps({
            "type": "update",
            "timestamp": datetime.now().isoformat(),
            "data": system_state
        })
        # Use asyncio.gather to send concurrently
        await asyncio.gather(*(
            connection.send_text(payload) 
            for connection in self.frontend_connections
            if connection.client_state == 1 # Check if socket is open
        ), return_exceptions=True)
        
    def update_system_logic(self):
        """Minimal logic to update system message."""
        if system_state["pole"]["connected"]:
            system_state["alerts"]["message"] = "System Healthy - Live Data Streaming"
        else:
            system_state["alerts"]["message"] = "CRITICAL: Pole Node Disconnected"


manager = ConnectionManager()

# ================= ENDPOINTS =================

@app.get("/")
def read_root():
    """Simple health check endpoint."""
    return {"status": "Smart Gridx Simplified Backend Running", "pole_connected": system_state["pole"]["connected"]}

# --- HARDWARE ENDPOINT (POLE) ---
@app.websocket("/ws/hardware/pole")
async def websocket_pole(websocket: WebSocket):
    await manager.connect_hardware(websocket, "pole")
    try:
        while True:
            # 1. Receive data from ESP32
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            # 2. Update State (using only required fields V, I, P, E)
            pole_data = {
                "voltage": payload.get("voltage", 0.0),
                "current": payload.get("current", 0.0),
                "power": payload.get("power", 0.0),
                "energy": payload.get("energy", 0.0),
                "last_seen": datetime.now().isoformat()
            }
            system_state["pole"].update(pole_data)
            
            # 3. Update logic and broadcast live data to frontend
            manager.update_system_logic()
            await manager.broadcast_state()
            
            # 4. Save data to Neon DB (for the report)
            await save_to_db(pole_data) 
            
    except WebSocketDisconnect:
        manager.disconnect_hardware("pole")
        await manager.broadcast_state()
    except Exception as e:
        logger.error(f"Error in pole WebSocket: {e}")
        # Cleanly disconnect if there's a JSON/parsing error
        manager.disconnect_hardware("pole")
        await manager.broadcast_state()


# --- FRONTEND ENDPOINT (CLIENT) ---
@app.websocket("/ws/client")
async def websocket_frontend(websocket: WebSocket):
    await manager.connect_frontend(websocket)
    try:
        # Send initial state immediately
        await manager.broadcast_state()
        
        while True:
            # Listen for commands from React (e.g., Generate Report)
            data = await websocket.receive_text()
            command = json.loads(data)
            
            if command.get("action") == "generate_report":
                logger.info("Report generation request received from frontend.")
                
                # TODO: Implement database query here (using Neon DB credentials)
                # Query all data for the last month.
                # Use a PDF generation library (e.g., ReportLab) to create the file.
                # Send the file back to the user or a link to the generated file.
                
                await websocket.send_text(json.dumps({
                    "type": "report_status", 
                    "message": "Report generation is in progress (DB query and PDF placeholder)."
                }))
            
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket)
