import json
import asyncio
import logging
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from datetime import datetime, timedelta
import asyncpg
from io import BytesIO

# --- PDF GENERATION LIBRARY ---
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet

# --- 1. CONFIGURATION ---
# *** YOUR SPECIFIC NEON CONNECTION STRING PLUGGED IN ***
NEON_DATABASE_URL = "postgresql://neondb_owner:npg_HeVoMQg56aCW@ep-withered-salad-ahigt95d-pooler.c-3.us-east-1.aws.neon.tech:5432/neondb?sslmode=require"

# --- 2. SETUP APP ---
app = FastAPI(title="Smart Gridx Backend")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SmartGridx")

# --- 2.1. CORS Policy ---
origins = [
    "https://smart-grid-x9.onrender.com", 
    "http://localhost:3000",
    "http://localhost:5173",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State (Live Data) - unchanged
system_state = {
    "pole": { "connected": False, "voltage": 0, "current": 0, "power": 0, "energy": 0, "last_seen": None },
    "alerts": { "message": "Waiting for Node..." }
}

# --- 3. DATABASE FUNCTION (Save) ---
async def save_to_db(data: dict):
    # ... (same as before, saves live reading) ...
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

# --- 4. REPORT GENERATION FUNCTION ---
async def generate_pdf_report():
    conn = None
    try:
        conn = await asyncpg.connect(NEON_DATABASE_URL)
        
        # 1. Query Data (Fetch data from the last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        
        # We fetch the COUNT (number of readings), AVG Power, and MAX/MIN Voltage
        data_summary = await conn.fetchrow('''
            SELECT 
                COUNT(*) as total_readings,
                AVG(power) as avg_power,
                MAX(voltage) as max_voltage,
                MIN(voltage) as min_voltage,
                SUM(CASE WHEN timestamp >= $1 THEN energy ELSE 0 END) as energy_consumed 
            FROM readings
            WHERE timestamp >= $1
        ''', thirty_days_ago)

        if not data_summary or data_summary['total_readings'] == 0:
            return None # Return None if no data is found

        # 2. Setup PDF Document
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        Story = []

        # 3. Build Content
        Story.append(Paragraph("Smart Gridx Monthly Energy Report", styles['Title']))
        Story.append(Spacer(1, 12))
        Story.append(Paragraph(f"Report Period: {thirty_days_ago.strftime('%b %d, %Y')} to {datetime.now().strftime('%b %d, %Y')}", styles['Normal']))
        Story.append(Spacer(1, 24))

        # Summary Table Data
        data = [
            ['Metric', 'Value', 'Unit'],
            ['Total Readings Captured', f"{data_summary['total_readings']}", 'Count'],
            ['Total Energy Consumed', f"{data_summary['energy_consumed']:.3f}", 'kWh'],
            ['Average Power', f"{data_summary['avg_power']:.2f}", 'W'],
            ['Max Voltage Detected', f"{data_summary['max_voltage']:.1f}", 'V'],
            ['Min Voltage Detected', f"{data_summary['min_voltage']:.1f}", 'V'],
        ]
        
        table = Table(data, colWidths=[200, 100, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2563eb')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('BACKGROUND', (0,1), (-1,-1), colors.beige),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        Story.append(table)
        Story.append(Spacer(1, 24))
        Story.append(Paragraph("This report is generated from real-time data stored in the Neon PostgreSQL database.", styles['Italic']))

        # 4. Finalize PDF and return buffer
        doc.build(Story)
        buffer.seek(0)
        return buffer.getvalue()
        
    except Exception as e:
        logger.error(f"PDF Report Generation Error: {e}")
        return None
    finally:
        if conn:
            await conn.close()

# --- 5. CONNECTION MANAGER & ENDPOINTS (Unchanged) ---
class ConnectionManager:
    # ... (same as before) ...
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

@app.get("/")
def root():
    return {"status": "Backend Running", "db_connected": True}

# Hardware Endpoint (ESP32) - Unchanged
@app.websocket("/ws/hardware/pole")
async def websocket_pole(websocket: WebSocket):
    # ... (same as before, handles ESP32 data and calls save_to_db) ...
    await websocket.accept()
    system_state["pole"]["connected"] = True
    logger.info("Hardware Connected: pole")
    
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            reading = {
                "voltage": float(payload.get("voltage", 0)),
                "current": float(payload.get("current", 0)),
                "power": float(payload.get("power", 0)),
                "energy": float(payload.get("energy", 0))
            }
            
            system_state["pole"].update(reading)
            system_state["pole"]["last_seen"] = datetime.now().isoformat()
            system_state["alerts"]["message"] = "Live Data Receiving"
            
            await manager.broadcast()
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

# --- 6. NEW HTTP ENDPOINT FOR PDF DOWNLOAD ---
# We use a standard HTTP GET endpoint because file downloads are easier over HTTP/S
@app.get("/report/monthly", response_class=Response)
async def get_monthly_report():
    pdf_bytes = await generate_pdf_report()
    
    if pdf_bytes is None:
        return Response(content="No data found for the report period.", status_code=404, media_type="text/plain")

    # Serve the PDF file
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=SmartGridX_Report_{datetime.now().strftime('%Y%m%d')}.pdf"
        }
    )

# Frontend Endpoint (WebSocket) - MODIFIED
@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await manager.broadcast()
        
        while True:
            data = await websocket.receive_text()
            cmd = json.loads(data)
            
            if cmd.get("action") == "generate_report":
                # Now we tell the client the report is ready to download via the new HTTP endpoint
                await websocket.send_text(json.dumps({
                    "type": "report_ready", 
                    "url": f"https://smart-grid-x9.onrender.com/report/monthly"
                }))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Frontend Client Disconnected")
