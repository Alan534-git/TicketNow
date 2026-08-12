const { useState, useEffect, useRef, useMemo, useCallback } = React;

const SECTOR_META = {
  platea_baja: { label: "Platea Baja" },
  platea_alta: { label: "Platea Alta" },
  campo: { label: "Campo" },
  palco_izq: { label: "Palco" },
  palco_der: { label: "Palco" },
};

function fmtMoney(n){
  return "$ " + n.toLocaleString("es-AR");
}

function fmtCountdown(ms){
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms/1000);
  const m = String(Math.floor(totalSec/60)).padStart(2,"0");
  const s = String(totalSec%60).padStart(2,"0");
  return `${m}:${s}`;
}

function useSocket(){
  const [seats, setSeats] = useState([]);
  const [stats, setStats] = useState({available:0, sold:0, online:0});
  const [clientId, setClientId] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let retryTimer;
    function connect(){
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 1500); // reconexión automática
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "welcome") setClientId(msg.clientId);
        if (msg.type === "state") {
          setSeats(msg.seats);
          setStats(msg.stats);
        }
      };
    }
    connect();
    return () => { clearTimeout(retryTimer); wsRef.current && wsRef.current.close(); };
  }, []);

  const send = useCallback((obj) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  return { seats, stats, clientId, connected, send };
}

function Seat({ seat, mine, onHover, onClick }){
  const cls = ["seat", seat.status, mine ? "mine" : ""].join(" ").trim();
  return (
    <div
      className={cls}
      onMouseEnter={(e) => onHover(seat, e)}
      onClick={() => seat.status === "available" || mine ? onClick(seat) : null}
      title={`Fila ${seat.row} - Asiento ${seat.seat}`}
    />
  );
}

function SectorBlock({ title, seats, myId, onHover, onClick }){
  const byRow = useMemo(() => {
    const map = {};
    seats.forEach(s => { (map[s.row] = map[s.row] || []).push(s); });
    return Object.keys(map).sort((a,b)=>a-b).map(r => map[r].sort((a,b)=>a.seat-b.seat));
  }, [seats]);

  return (
    <div className="sector-block">
      <div className="sector-name">{title}</div>
      <div className="rows">
        {byRow.map((row, i) => (
          <div className="row" key={i}>
            {row.map(seat => (
              <Seat key={seat.id} seat={seat} mine={seat.ownerId === myId} onHover={onHover} onClick={onClick} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function App(){
  const { seats, stats, clientId, connected, send } = useSocket();
  const [sectorFilter, setSectorFilter] = useState("todos");
  const [tooltip, setTooltip] = useState(null); // {seat, x, y}
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const mySeats = useMemo(
    () => seats.filter(s => s.status === "selected" && s.ownerId === clientId),
    [seats, clientId]
  );

  const earliestExpiry = useMemo(() => {
    if (mySeats.length === 0) return null;
    return Math.min(...mySeats.map(s => s.expiresAt));
  }, [mySeats]);

  const subtotal = mySeats.reduce((acc, s) => acc + s.price, 0);
  const serviceFee = Math.round(subtotal * 0.10);
  const total = subtotal + serviceFee;

  const sectors = ["platea_baja", "platea_alta", "campo", "palco_izq", "palco_der"];
  const visibleSectors = sectorFilter === "todos" ? sectors : [sectorFilter];

  function handleHover(seat, e){
    if (seat.status === "sold") { setTooltip(null); return; }
    const rect = e.target.getBoundingClientRect();
    setTooltip({ seat, x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 6 });
  }

  function handleSelect(seat){
    if (seat.ownerId === clientId && seat.status === "selected") {
      send({ type: "deselect", seatId: seat.id });
    } else if (seat.status === "available") {
      send({ type: "select", seatId: seat.id });
    }
    setTooltip(null);
  }

  function removeFromCart(seatId){
    send({ type: "deselect", seatId });
  }

  function checkout(){
    if (mySeats.length === 0) return;
    send({ type: "purchase", seatIds: mySeats.map(s => s.id) });
  }

  const filterButtons = [
    { id: "todos", label: "Todos" },
    { id: "platea_baja", label: "Platea Baja" },
    { id: "platea_alta", label: "Platea Alta" },
    { id: "campo", label: "Campo" },
    { id: "palco_izq", label: "Palcos" },
  ];

  return (
    <React.Fragment>
      <header>
        <div className="brand">
          <div className="logo">🎫</div>
          <div>
            TicketNow
            <span className="sub">ENTRADAS MASIVAS</span>
          </div>
        </div>
        <nav>
          <a className="active">🏠 EVENTO</a>
          <a>▦ MAPA DE ASIENTOS</a>
          <a>📋 INFORMACIÓN</a>
          <a>FAQ</a>
          <a>CONTACTO</a>
        </nav>
        <div className="header-right">
          <div className="cart-btn">🛒<span className="cart-badge">{mySeats.length}</span></div>
          <div className="account">👤 Mi cuenta ▾</div>
        </div>
      </header>

      <div className="hero">
        <div className="hero-event">
          <div className="hero-thumb"></div>
          <div>
            <div className="eyebrow">CONCIERTO DEL AÑO</div>
            <h1>NOCHE INOLVIDABLE</h1>
            <div className="hero-meta">
              <span>📍 Estadio Único de La Plata</span>
              <span>📅 Sábado 21 de Diciembre, 2024 • 21:00 hs</span>
            </div>
          </div>
        </div>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">🕐 CONTADOR GLOBAL</div>
            <div className="stat-value green">{stats.available}</div>
            <div className="stat-sub">entradas disponibles</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">📡 VENTAS EN VIVO</div>
            <div className="stat-value">{stats.sold.toLocaleString("es-AR")}</div>
            <div className="stat-sub">entradas vendidas</div>
          </div>
          <div className="stat-card">
            <div className="stat-label"><span className="dot-live"></span> PERSONAS EN LÍNEA</div>
            <div className="stat-value">{stats.online.toLocaleString("es-AR")}</div>
            <div className="stat-sub">comprando ahora</div>
          </div>
        </div>
      </div>

      <div className="layout">
        {/* Panel izquierdo */}
        <div className="panel">
          <h3><span className="step-num">1</span> SELECCIONÁ SECTOR</h3>
          <div className="sector-grid">
            {filterButtons.map((b, i) => (
              <button
                key={b.id}
                className={"sector-btn" + (sectorFilter === b.id ? " active" : "")}
                style={i === 0 ? {gridColumn:"span 2"} : {}}
                onClick={() => setSectorFilter(b.id)}
              >{b.label}</button>
            ))}
          </div>

          <h3><span className="step-num">2</span> ELEGÍ TUS ASIENTOS</h3>
          <div className="legend-item"><span className="legend-dot" style={{background:"var(--green)"}}></span> Disponible</div>
          <div className="legend-item"><span className="legend-dot" style={{background:"var(--red)"}}></span> Ocupado</div>
          <div className="legend-item"><span className="legend-dot" style={{background:"var(--yellow)"}}></span> Seleccionado</div>
          <div className="legend-item"><span className="legend-dot" style={{background:"var(--gray)"}}></span> No disponible</div>

          <div className="info-box">🛡️ <div><b>Compra 100% segura</b><br/>Tus datos y pagos están protegidos. Transacción cifrada.</div></div>
        </div>

        {/* Mapa de asientos */}
        <div className="panel map-panel" style={{position:"relative"}} onMouseLeave={() => setTooltip(null)}>
          <div className="stage">ESCENARIO</div>
          <div className="seatmap">
            {sectorFilter === "todos" && (
              <div className="palcos-row">
                <SectorBlock title="PALCO" seats={seats.filter(s=>s.sector==="palco_izq")} myId={clientId} onHover={handleHover} onClick={handleSelect} />
                <SectorBlock title="PALCO" seats={seats.filter(s=>s.sector==="palco_der")} myId={clientId} onHover={handleHover} onClick={handleSelect} />
              </div>
            )}

            {visibleSectors.filter(s => s !== "palco_der").map(sec => {
              if (sec === "palco_izq" && sectorFilter === "todos") return null;
              const label = sec === "palco_izq" ? "PALCO IZQUIERDO" : sec === "palco_der" ? "PALCO DERECHO" : SECTOR_META[sec].label.toUpperCase();
              return (
                <SectorBlock key={sec} title={label} seats={seats.filter(s => s.sector === sec)} myId={clientId} onHover={handleHover} onClick={handleSelect} />
              );
            })}
          </div>
          <div className="hint">👆 Hacé clic sobre un asiento para seleccionarlo</div>

          {tooltip && (
            <div className="tooltip" style={{left: tooltip.x, top: tooltip.y}}>
              <b>{SECTOR_META[tooltip.seat.sector]?.label || tooltip.seat.sectorLabel}</b>
              Fila {tooltip.seat.row} - Asiento {tooltip.seat.seat}
              <div className="price">{fmtMoney(tooltip.seat.price)}</div>
              <button onClick={() => handleSelect(tooltip.seat)}>
                {tooltip.seat.ownerId === clientId ? "Quitar" : "Seleccionar"}
              </button>
            </div>
          )}
        </div>

        {/* Carrito */}
        <div className="panel">
          <h3><span className="step-num">3</span> TUS ASIENTOS ({mySeats.length})
            {mySeats.length > 0 && <a style={{marginLeft:"auto", color:"var(--purple)", fontSize:12, fontWeight:700, cursor:"pointer"}} onClick={() => mySeats.forEach(s=>removeFromCart(s.id))}>Limpiar todo</a>}
          </h3>

          {mySeats.length === 0 && <div className="cart-empty">Todavía no seleccionaste asientos.</div>}
          {mySeats.map(s => (
            <div className="cart-item" key={s.id}>
              <div>
                <div className="sec">{SECTOR_META[s.sector]?.label}</div>
                <div className="row-seat">Fila {s.row} - Asiento {s.seat}</div>
                <div className="price">{fmtMoney(s.price)}</div>
              </div>
              <button className="remove-btn" onClick={() => removeFromCart(s.id)}>✕</button>
            </div>
          ))}

          {mySeats.length > 0 && (
            <React.Fragment>
              <div className="totals-row"><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
              <div className="totals-row"><span>Cargo por servicio</span><span>{fmtMoney(serviceFee)}</span></div>
              <div className="total-row"><span>TOTAL</span><span>{fmtMoney(total)}</span></div>
            </React.Fragment>
          )}

          <button className="buy-btn" disabled={mySeats.length === 0} onClick={checkout}>🔒 Continuar compra</button>

          {earliestExpiry && (
            <div className="timer-box">
              <span>¡Las entradas se reservan por 10 minutos!</span>
              <span className="timer-val">🕐 {fmtCountdown(earliestExpiry - now)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="conn-badge">
        <span className={"conn-dot " + (connected ? "ok" : "bad")}></span>
        {connected ? "Conectado en tiempo real" : "Reconectando..."}
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
