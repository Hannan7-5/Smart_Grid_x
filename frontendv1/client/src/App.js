import React, { useState, useEffect } from 'react';
import './App.css';
import { Wifi, Activity, Zap, FileText, Database, TrendingUp, Power } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// =================================================================
// *** CRITICAL: UPDATE THIS WITH YOUR RENDER WSS URL ***
// Your Backend URL: wss://smart-grid-x9.onrender.com/ws/client
// =================================================================
const WS_URL = "wss://smart-grid-x9.onrender.com/ws/client"; 
const MAX_DATA_POINTS = 30; // Limit graph history to 30 points

const App = () => {
  // State to hold live data from the backend
  const [data, setData] = useState({
    pole: { voltage: 0, current: 0, power: 0, energy: 0, connected: false, last_seen: null },
    alerts: { message: "Connecting to Backend..." }
  });
  
  // State to hold historical data for charting
  const [chartData, setChartData] = useState([]);

  // WebSocket Connection Logic
  useEffect(() => {
    let ws;

    const connect = () => {
        ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            
            if (payload.type === "update") {
                const newData = payload.data;
                setData(newData);

                // Add new data point to history for charting
                setChartData(prevChartData => {
                    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    
                    // Format data point for Recharts
                    const newPoint = {
                        time: currentTime,
                        voltage: newData.pole.voltage,
                        current: newData.pole.current,
                        energy: newData.pole.energy, // Total cumulative energy
                        power: newData.pole.power // Active Power
                    };

                    // Append new point and limit array size
                    const updatedData = [...prevChartData, newPoint];
                    if (updatedData.length > MAX_DATA_POINTS) {
                        updatedData.shift(); // Remove the oldest point
                    }
                    return updatedData;
                });
            } else if (payload.type === "report_ready") {
                // Handle PDF Download
                window.open(payload.url, '_blank');
            }
        };

        ws.onclose = () => { setTimeout(connect, 5000); };
        ws.onerror = (err) => { console.error('Socket error:', err); ws.close(); };
        ws.onopen = () => { console.log('Connected to WebSocket server'); };
    };

    connect();
    return () => ws && ws.close();
  }, []);

  const generateReport = () => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        ws.send(JSON.stringify({ action: "generate_report" }));
        alert("Request sent to server. Download will start shortly!");
    };
  };

  const { pole, alerts } = data;

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const lastSeen = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.round((now - lastSeen) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
    if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} minutes ago`;
    
    return lastSeen.toLocaleTimeString();
  };


  // --- Helper Component for Charts ---
  const ChartCard = ({ title, dataKey, unit, color }) => (
    <div className="chart-card">
        <h3>{title}</h3>
        <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="time" hide={true} />
                <YAxis unit={unit} domain={[dataKey === 'voltage' ? 200 : 0, 'auto']} />
                <Tooltip 
                    formatter={(value) => [`${value.toFixed(2)} ${unit}`, dataKey]} 
                    labelFormatter={(label) => `Time: ${label}`}
                />
                <Legend layout="horizontal" verticalAlign="top" align="right" />
                <Line 
                    type="monotone" 
                    dataKey={dataKey} 
                    name={dataKey.charAt(0).toUpperCase() + dataKey.slice(1)} 
                    stroke={color} 
                    dot={false}
                    strokeWidth={2}
                />
            </LineChart>
        </ResponsiveContainer>
    </div>
  );


  return (
    <div className="dashboard">
      {/* Header and Status */}
      <header className="header">
        <div className="brand">
          <Activity className="icon" />
          <h1>Smart Gridx Energy Monitor</h1>
        </div>
        <div className={`status ${pole.connected ? 'online' : 'offline'}`}>
          <Wifi size={18} />
          {pole.connected ? "Node Connected" : "Node Disconnected"}
        </div>
      </header>

      <main>
        {/* Status Banner */}
        <div className="banner">
          <Database size={20} />
          <span>System Alert: **{alerts.message}** | Last Data Update: {formatLastSeen(pole.last_seen)}</span>
        </div>

        {/* Data Cards (Unchanged) */}
        <div className="grid">
          <div className="card">
            <TrendingUp size={30} className="card-icon" />
            <h3>Voltage</h3>
            <div className="value">{pole.voltage.toFixed(1)} <span className="unit">V</span></div>
          </div>
          <div className="card">
            <Zap size={30} className="card-icon" />
            <h3>Current</h3>
            <div className="value">{pole.current.toFixed(2)} <span className="unit">A</span></div>
          </div>
          <div className="card">
            <Power size={30} className="card-icon" />
            <h3>Power</h3>
            <div className="value">{pole.power.toFixed(0)} <span className="unit">W</span></div>
          </div>
          <div className="card highlight">
            <FileText size={30} className="card-icon" />
            <h3>Energy (Total)</h3>
            <div className="value">{pole.energy.toFixed(3)} <span className="unit">kWh</span></div>
          </div>
        </div>
        
        {/* REAL-TIME CHARTS SECTION */}
        <div className="charts-section">
            <h2>Real-Time Performance Graphs</h2>
            <div className="charts-grid">
                <ChartCard title="Voltage (V)" dataKey="voltage" unit="V" color="#057a55" />
                <ChartCard title="Current (A)" dataKey="current" unit="A" color="#f97316" />
                <ChartCard title="Active Power (W)" dataKey="power" unit="W" color="#3b82f6" />
            </div>
        </div>

        {/* Table View (Unchanged) */}
        <div className="table-container">
          <h2>Live Readings</h2>
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Grid Voltage</td>
                <td>{pole.voltage.toFixed(2)}</td>
                <td>Volts (V)</td>
                <td>{pole.voltage > 200 ? "Normal" : "Low"}</td>
              </tr>
              <tr>
                <td>Load Current</td>
                <td>{pole.current.toFixed(3)}</td>
                <td>Amps (A)</td>
                <td>{pole.current > 0.1 ? "Active Load" : "Idle"}</td>
              </tr>
              <tr>
                <td>Active Power</td>
                <td>{pole.power.toFixed(2)}</td>
                <td>Watts (W)</td>
                <td>{pole.power > 100 ? "High Usage" : "Low Usage"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Report Button (Unchanged) */}
        <div className="actions">
          <button className="btn-report" onClick={generateReport}>
            <FileText size={20} />
            Generate Monthly Report (Data from Neon DB)
          </button>
        </div>
      </main>
    </div>
  );
};

export default App;
