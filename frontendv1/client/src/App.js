import React, { useState, useEffect } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  defs,
  linearGradient,
  stop 
} from 'recharts';
import { 
  Activity, 
  Zap, 
  AlertTriangle, 
  ShieldCheck, 
  Server, 
  Thermometer, 
  Wifi, 
  Home,
  Clock,
  Battery
} from 'lucide-react';
import './App.css'; 

const WS_URL = "wss://smartgridxbackend.onrender.com/ws/client"; 

const defaultSystemData = {
  pole: { connected: false, voltage: 0, power: 0, current: 0, energy: 0, frequency: 0, pf: 0 },
  house: { connected: false, voltage: 0, power: 0, current: 0, energy: 0, temperature: 0, pf: 0, relays: [false, false, false, false] },
  alerts: { theft_detected: false, maintenance_risk: false, risk_score: 0, message: "Waiting for connection..." }
};

// --- Helper Component: Stat Card ---
const StatCard = ({ label, value, unit, icon: Icon, colorClass }) => (
  <div className="stat-card">
    <div className="stat-content">
      <p className="stat-label">{label}</p>
      <div className="stat-value-wrapper">
        <span className="stat-value">{value}</span>
        <span className="stat-unit">{unit}</span>
      </div>
    </div>
    <div className={`icon-badge ${colorClass}`}>
      <Icon size={20} />
    </div>
  </div>
);

// --- Helper Component: Relay Button ---
const RelayButton = ({ index, state, onClick }) => (
  <button 
    onClick={() => onClick(index, !state)} 
    className={`relay-btn ${state ? 'active' : ''}`}
  >
    <div className="relay-info">
      <div className={`relay-dot ${state ? 'on' : 'off'}`} />
      <span className="relay-name">Circuit {index + 1}</span>
    </div>
    <span className="relay-status-text">{state ? 'ON' : 'OFF'}</span>
  </button>
);

const App = () => {
  const [socket, setSocket] = useState(null);
  const [systemData, setSystemData] = useState(defaultSystemData);
  const [trendData, setTrendData] = useState([]);

  // --- WebSocket Connection ---
  useEffect(() => {
    let ws;
    const connect = () => {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => { console.log("Connected"); setSocket(ws); };
        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "update") {
                    setSystemData(payload.data);
                    // Update Chart Data (Keep last 20 points)
                    setTrendData(prev => {
                      const newData = [...prev, {
                          time: new Date().toLocaleTimeString(),
                          grid: payload.data.pole.power,
                          house: payload.data.house.power
                      }];
                      return newData.slice(-20);
                    });
                }
            } catch (e) { console.error(e); }
        };
        ws.onclose = () => { setTimeout(connect, 3000); };
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, []);

  // --- Relay Toggle Handler ---
  const toggleRelay = (index, newState) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: "set_relay", relay_index: index, state: newState }));
    } else {
        alert("System Offline");
    }
  };

  const pole = systemData.pole || defaultSystemData.pole;
  const house = systemData.house || defaultSystemData.house;
  const alerts = systemData.alerts || defaultSystemData.alerts;

  return (
    <div className="dashboard-container">
      
      {/* --- HEADER --- */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon-wrapper">
            <Activity size={28} className="brand-icon" />
          </div>
          <div className="brand-text">
            <h1>Smart Gridx</h1>
            <p>IoT Monitoring & Predictive Maintenance</p>
          </div>
        </div>

        <div className="header-status">
           <div className={`status-item ${pole.connected ? 'online' : 'offline'}`}>
              <Wifi size={16} /> 
              <span>Grid: {pole.connected ? 'Online' : 'Offline'}</span>
           </div>
           <div className={`status-item ${house.connected ? 'online' : 'offline'}`}>
              <Server size={16} /> 
              <span>SPAN: {house.connected ? 'Online' : 'Offline'}</span>
           </div>
        </div>
      </header>

      {/* --- ALERTS SECTION --- */}
      <div className="alerts-container">
        {alerts.theft_detected && (
          <div className="alert-banner danger">
            <div className="alert-icon-bg"><AlertTriangle size={20} /></div>
            <div className="alert-content">
                <strong>THEFT DETECTED</strong>
                <span>Power mismatch detected between Pole and House source.</span>
            </div>
          </div>
        )}
        {alerts.maintenance_risk && (
          <div className="alert-banner warning">
            <div className="alert-icon-bg"><Activity size={20} /></div>
             <div className="alert-content">
                <strong>MAINTENANCE REQUIRED</strong>
                <span>System risk score is {alerts.risk_score}. Check equipment immediately.</span>
            </div>
          </div>
        )}
      </div>

      {/* --- MAIN GRID LAYOUT --- */}
      <main className="main-grid">
        
        {/* --- LEFT COLUMN: POLE --- */}
        <section className="panel-section">
          <div className="section-header">
            <Zap className="section-icon" size={20} />
            <h2>Grid Source (Pole)</h2>
          </div>

          <div className="stats-grid">
            <StatCard label="Voltage" value={(pole.voltage || 0).toFixed(1)} unit="V" icon={Zap} colorClass="amber" />
            <StatCard label="Power" value={(pole.power || 0).toFixed(0)} unit="W" icon={Activity} colorClass="amber" />
            <StatCard label="Frequency" value={(pole.frequency || 0).toFixed(1)} unit="Hz" icon={Clock} colorClass="blue" />
            <StatCard label="PF" value={(pole.pf || 0).toFixed(2)} unit="" icon={ShieldCheck} colorClass="green" />
          </div>

          {/* REAL CHART */}
          <div className="card-container chart-container">
            <h3>Real-time Power Trend</h3>
            <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                <AreaChart data={trendData}>
                    <defs>
                    <linearGradient id="colorGrid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHouse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="time" hide />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="grid" stroke="#f59e0b" fillOpacity={1} fill="url(#colorGrid)" strokeWidth={2} />
                    <Area type="monotone" dataKey="house" stroke="#3b82f6" fillOpacity={1} fill="url(#colorHouse)" strokeWidth={2} />
                </AreaChart>
                </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* --- RIGHT COLUMN: HOUSE & AI --- */}
        <section className="panel-section">
          <div className="section-header">
            <Server className="section-icon" size={20} />
            <h2>Smart Home (SPAN Panel)</h2>
          </div>
          
          <div className="stats-grid">
            <StatCard label="Consumption" value={(house.power || 0).toFixed(0)} unit="W" icon={Home} colorClass="blue" />
            <StatCard label="Current" value={(house.current || 0).toFixed(2)} unit="A" icon={Battery} colorClass="purple" />
            <StatCard label="Temperature" value={(house.temperature || 0).toFixed(1)} unit="°C" icon={Thermometer} colorClass={house.temperature > 40 ? "red" : "green"} />
            <StatCard label="Energy" value={(house.energy || 0).toFixed(2)} unit="kWh" icon={Zap} colorClass="orange" />
          </div>

          {/* RELAY CONTROL */}
          <div className="card-container relay-container">
            <h3>Circuit Control</h3>
            <div className="relay-grid">
              {(house.relays || [false, false, false, false]).map((state, idx) => (
                <RelayButton key={idx} index={idx} state={state} onClick={toggleRelay} />
              ))}
            </div>
          </div>

          {/* AI HEALTH MONITOR */}
          <div className="card-container ai-card">
              <div className="ai-header-row">
                  <h3>AI Health Monitor</h3>
                  <div className={`ai-badge ${alerts.maintenance_risk ? 'bad' : 'good'}`}>
                      {alerts.maintenance_risk ? 'RISK DETECTED' : 'SYSTEM OPTIMAL'}
                  </div>
              </div>

              <div className="ai-body">
                 <div className="risk-metric">
                    <span className="risk-score">{(alerts.risk_score || 0).toFixed(2)}</span>
                    <span className="risk-label">Failure Probability (Px)</span>
                 </div>
                 <p className="ai-message">{alerts.message}</p>
                 
                 <div className="ai-progress-track">
                    <div 
                        className={`ai-progress-fill ${alerts.maintenance_risk ? 'bad' : 'good'}`}
                        style={{ width: `${Math.min((alerts.risk_score || 0) * 100, 100)}%` }}
                    />
                 </div>
              </div>
          </div>

        </section>
      </main>
    </div>
  );
};

export default App;
