import json
import asyncio
import logging
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import asyncpg 

# --- 1. CONFIGURATION ---
# *** YOUR SPECIFIC NEON CONNECTION STRING PLUGGED IN ***
NEON_DATABASE_URL = "postgresql://neondb_owner:npg_HeVoMQg56aCW@ep-withered-salad-ahigt95d-pooler.c-3.us-east-1.aws.neon.tech:5432/neondb?sslmode=require"

# --- 2. SETUP APP ---
app = FastAPI(title="Smart Gridx Backend")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SmartGridx")

# --- 2.1. CORS Policy (Crucial for Local Frontend Development) ---
# Add your Render hostname and common local development ports (3000 & 5173)
origins = [
    "https://smart-grid-x9.onrender.com", 
    "http://localhost:3000",          # Standard React Dev Port
    "http://localhost:5173",          # Standard Vite/Modern Dev Port
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "*" # Safety net for other hosts
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State (Live Data)
system_state = {
    "pole": { "connected": False, "voltage": 0, "current": 0, "power": 0, "energy": 0, "last_seen": None },
    "alerts": { "message": "Waiting for Node..." }
}

# --- 3. DATABASE FUNCTION ---
async def save_to_db(data: dict):
    """Saves live readings to Neon PostgreSQL"""
    conn = None
    try:
        conn = await asyncpg.connect(NEON_DATABASE_URL)
        
        await conn.execute('''
            INSERT INTO readings(voltage, current, power, energy, timestamp)
            VALUES($1, $2, $3, $4, $5)
        ''', data['voltage'], data['current'], data['power'], data['energy'], datetime.now())
        
        logger.info(f"Saved to Neon DB: {data['power']}W")
        
    except Exception as e:
        logger.error(f"Database Error: {e}")
    finally:
        if conn:
            await conn.close()

# --- 4. CONNECTION MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self):
        payload = json.dumps({"type": "update", "data": system_state})
        await asyncio.gather(*(
            connection.send_text(payload) 
            for connection in self.active_connections
        ), return_exceptions=True)

manager = ConnectionManager()

# --- 5. ENDPOINTS ---

@app.get("/")
def root():
    return {"status": "Backend Running", "db_connected": True}

# Hardware Endpoint (ESP32 connects here)
@app.websocket("/ws/hardware/pole")
async def websocket_pole(websocket: WebSocket):
    await websocket.accept()
    system_state["pole"]["connected"] = True
    logger.info("Hardware Connected: pole")
    
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            # Extract and convert readings
            reading = {
                "voltage": float(payload.get("voltage", 0)),
                "current": float(payload.get("current", 0)),
                "power": float(payload.get("power", 0)),
                "energy": float(payload.get("energy", 0))
            }
            
            # Update Live State
            system_state["pole"].update(reading)
            system_state["pole"]["last_seen"] = datetime.now().isoformat()
            system_state["alerts"]["message"] = "Live Data Receiving"
            
            # Broadcast to Frontend
            await manager.broadcast()
            
            # Save to Neon DB
            await save_to_db(reading)
            
    except WebSocketDisconnect:
        logger.warning("Pole Node Disconnected")
        system_state["pole"]["connected"] = False
        system_state["alerts"]["message"] = "Node Disconnected"
        await manager.broadcast()
    except Exception as e:
        logger.error(f"Error in pole WebSocket loop: {e}")
        system_state["pole"]["connected"] = False
        await manager.broadcast()

# Frontend Endpoint (React connects here)
@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await manager.broadcast()
        
        while True:
            data = await websocket.receive_text()
            cmd = json.loads(data)
            if cmd.get("action") == "generate_report":
                await websocket.send_text(json.dumps({"type": "alert", "msg": "Report generation feature coming soon!"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Frontend Client Disconnected")
