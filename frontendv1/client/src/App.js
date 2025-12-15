import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Zap, AlertTriangle, ShieldCheck, Server, Thermometer, Wifi } from 'lucide-react';
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
    <div>
      <p className="stat-label">{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span className="stat-value">{value}</span>
        <span className="stat-unit">{unit}</span>
      </div>
    </div>
    <div className={`icon-wrapper ${colorClass}`}>
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
      <div className="relay-dot" />
      <span className="relay-name">Circuit {index + 1}</span>
    </div>
    <div className="relay-status">
      {state ? 'ON' : 'OFF'}
    </div>
  </button>
);

const App = () => {
  const [socket, setSocket] = useState(null);
  const [systemData, setSystemData] = useState(defaultSystemData);
  const [trendData, setTrendData] = useState([]);

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
      
      {/* HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon"><Activity size={28} /></div>
          <div className="header-title">
            <h1>Smart Gridx</h1>
            <p>IoT Monitoring & Predictive Maintenance</p>
          </div>
        </div>
        <div className="status-badges">
           <div className={`status-badge ${pole.connected ? 'online' : 'offline'}`}>
              <Wifi size={16} /> Grid: {pole.connected ? 'Online' : 'Offline'}
           </div>
           <div className={`status-badge ${house.connected ? 'online' : 'offline'}`}>
              <Server size={16} /> SPAN: {house.connected ? 'Online' : 'Offline'}
           </div>
        </div>
      </header>

      {/* ALERTS */}
      <div style={{ marginTop: '1.5rem' }}>
        {alerts.theft_detected && (
          <div className="alert-box danger">
            <div style={{ background: '#fee2e2', padding: '0.5rem', borderRadius: '50%' }}><AlertTriangle size={20} /></div>
            <div><strong>THEFT DETECTED:</strong> Power mismatch between Pole and House!</div>
          </div>
        )}
        {alerts.maintenance_risk && (
          <div className="alert-box warning">
            <div style={{ background: '#fef3c7', padding: '0.5rem', borderRadius: '50%' }}><Activity size={20} /></div>
            <div><strong>MAINTENANCE ALERT:</strong> Risk Score {alerts.risk_score}. Check equipment.</div>
          </div>
        )}
      </div>

      {/* MAIN GRID */}
      <div className="main-grid">
        
        {/* LEFT COLUMN: POLE */}
        <div className="column">
          <div className="section-header">
            <Zap size={20} color="#94a3b8" />
            <h2>Grid Source (Pole)</h2>
          </div>
          <div className="stats-grid">
            <StatCard label="Voltage" value={(pole.voltage || 0).toFixed(1)} unit="V" icon={Zap} colorClass="amber" />
            <StatCard label="Power" value={(pole.power || 0).toFixed(0)} unit="W" icon={Activity} colorClass="amber" />
            <StatCard label="Frequency" value={(pole.frequency || 0).toFixed(1)} unit="Hz" icon={Activity} colorClass="blue" />
            <StatCard label="PF" value={(pole.pf || 0).toFixed(2)} unit="" icon={ShieldCheck} colorClass="emerald" />
          </div>

          <div className="chart-card">
            <h3 className="chart-title">Real-time Power Trend</h3>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorGrid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHouse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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

        {/* RIGHT COLUMN: HOUSE */}
        <div className="column">
          <div className="section-header">
            <Server size={20} color="#94a3b8" />
            <h2>Smart Home (SPAN Panel)</h2>
          </div>
          
          <div className="stats-grid">
            <StatCard label="Consumption" value={(house.power || 0).toFixed(0)} unit="W" icon={Zap} colorClass="blue" />
            <StatCard label="Current" value={(house.current || 0).toFixed(2)} unit="A" icon={Activity} colorClass="blue" />
            <StatCard label="Temperature" value={(house.temperature || 0).toFixed(1)} unit="°C" icon={Thermometer} colorClass={house.temperature > 40 ? "red" : "emerald"} />
            <StatCard label="Energy" value={(house.energy || 0).toFixed(2)} unit="kWh" icon={Zap} colorClass="purple" />
          </div>

          <div className="relay-card">
            <h3 className="chart-title" style={{ marginBottom: '1rem' }}>Circuit Control</h3>
            <div className="relay-grid">
              {(house.relays || [false, false, false, false]).map((state, idx) => (
                <RelayButton key={idx} index={idx} state={state} onClick={toggleRelay} />
              ))}
            </div>
          </div>

          <div className="ai-card">
             <div className="ai-header">AI Health Monitor</div>
             <div className="ai-stats">
               <div>
                 <div className="risk-value">{alerts.risk_score || 0}</div>
                 <div className="risk-label">Risk Probability (Px)</div>
               </div>
               <div className="ai-status">
                 <div className={`status-text ${alerts.maintenance_risk ? 'bad' : 'ok'}`}>
                   {alerts.maintenance_risk ? 'MAINTENANCE NEEDED' : 'OPTIMAL'}
                 </div>
                 <div className="status-msg">{alerts.message}</div>
               </div>
             </div>
             <div className="progress-bar">
               <div 
                 className={`progress-fill ${alerts.maintenance_risk ? 'bad' : 'ok'}`}
                 style={{ width: `${Math.min((alerts.risk_score || 0) * 100, 100)}%` }}
               />
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
