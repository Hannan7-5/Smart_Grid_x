import React, { useState, useEffect } from 'react';
import './App.css';
import { Wifi, Activity, Zap, FileText, Database, TrendingUp, Power } from 'lucide-react';

// =================================================================
// *** CRITICAL: UPDATE THIS WITH YOUR RENDER WSS URL ***
// Your Backend URL: wss://smart-grid-x9.onrender.com/ws/client
// =================================================================
const WS_URL = "wss://smart-grid-x9.onrender.com/ws/client"; 

const App = () => {
  // State to hold live data received from the backend
  const [data, setData] = useState({
    pole: { voltage: 0, current: 0, power: 0, energy: 0, connected: false, last_seen: null },
    alerts: { message: "Connecting to Backend..." }
  });

  // WebSocket Connection Logic
  useEffect(() => {
    let ws;

    const connect = () => {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
            console.log('Connected to WebSocket server');
        };

        ws.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.type === "update") {
                // Update the state with the latest data from the backend
                setData(payload.data);
            }
        };

        ws.onclose = (event) => {
            console.log('Disconnected. Attempting reconnect in 5s...', event.reason);
            // Attempt to reconnect after a delay
            setTimeout(connect, 5000); 
        };

        ws.onerror = (err) => {
            console.error('Socket error:', err);
            ws.close();
        };
    };

    connect();

    // Clean up function: close the WebSocket when the component unmounts
    return () => ws.close();
  }, []);

  const generateReport = () => {
    // In a final project, this would trigger a DB query and PDF generation on the backend.
    alert("Report generation request sent to the backend. (Future feature: Downloads PDF from Neon data)");
  };

  const { pole, alerts } = data;

  // Function to calculate and format Last Seen time
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const lastSeen = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.round((now - lastSeen) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
    if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} minutes ago`;
    
    return lastSeen.toLocaleTimeString();
  };

  return (
    <div className="dashboard">
      {/* Header */}
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

      {/* Main Content */}
      <main>
        {/* Status Banner */}
        <div className="banner">
          <Database size={20} />
          <span>System Alert: **{alerts.message}** | Last Data Update: {formatLastSeen(pole.last_seen)}</span>
        </div>

        {/* Data Cards */}
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

        {/* Table View */}
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

        {/* Report Button */}
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
