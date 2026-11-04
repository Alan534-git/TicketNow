const { useState, useEffect, useRef, useMemo, useCallback } = React;

const SECTOR_META = {
  platea_baja: { label: "Platea Baja" },
  platea_alta: { label: "Platea Alta" },
  campo: { label: "Campo" },
  palco_izq: { label: "Palco" },
  palco_der: { label: "Palco" },
};

// Sectores tal como se muestran en el inicio (tarjetas de precio de la vista 2)
const HOME_SECTORS = [
  { id: "platea_baja", label: "Platea Baja", tag: "SECTOR", price: 12500, match: (s) => s.sector === "platea_baja" },
  { id: "platea_alta", label: "Platea Alta", tag: "SECTOR", price: 9000, match: (s) => s.sector === "platea_alta" },
  { id: "campo", label: "Campo", tag: "SECTOR", price: 8000, match: (s) => s.sector === "campo" },
  { id: "palcos", label: "Palcos", tag: "PALCOS", price: 18000, match: (s) => s.sector === "palco_izq" || s.sector === "palco_der" },
];

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

// ---------------------------------------------------------------------------
// INICIO — Vista 1: Hero
// ---------------------------------------------------------------------------
function HeroSection({ onBuyClick, onSeeSectorsClick }){
  return (
    <section className="home-hero">
      <div className="home-hero-bg">
        <div className="home-hero-rays"></div>
        <div className="home-hero-stage">
          <div className="stage-silhouette left"></div>
          <div className="stage-lightbar">
            {Array.from({length:9}).map((_,i)=><span key={i}></span>)}
          </div>
          <div className="stage-silhouette right"></div>
        </div>
        <div className="home-hero-crowd"></div>
      </div>

      <div className="home-hero-content">
        <div className="home-badge"><span className="dot-live"></span> CONCIERTO DEL AÑO</div>
        <h1 className="home-title">NOCHE INOLVIDABLE</h1>
        <div className="home-meta">
          <span>📍 Estadio Único de La Plata</span>
          <span>📅 Sábado 21 de Diciembre, 2024 · 21:00 hs</span>
        </div>
        <div className="home-cta-row">
          <button className="btn-primary" onClick={onBuyClick}>🎫 Elegí mis asientos</button>
          <button className="btn-outline" onClick={onSeeSectorsClick}>Ver sectores y precios</button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// INICIO — Vista 2: contador global + sectores y precios
// ---------------------------------------------------------------------------
function SectorsSection({ seats, stats, sectionRef, onSectorClick }){
  const sectorData = useMemo(() => {
    return HOME_SECTORS.map(sec => {
      const secSeats = seats.filter(sec.match);
      const total = secSeats.length;
      const sold = secSeats.filter(s => s.status === "sold").length;
      const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
      return { ...sec, pct };
    });
  }, [seats]);

  return (
    <section className="home-section" ref={sectionRef} id="sectores">
      <div className="home-stats-row">
        <div className="home-stat">
          <div className="home-stat-label"><span className="stat-dot green"></span> ENTRADAS DISPONIBLES</div>
          <div className="home-stat-value green">{stats.available.toLocaleString("es-AR")}</div>
        </div>
        <div className="home-stat">
          <div className="home-stat-label"><span className="stat-dot pink"></span> VENDIDAS HOY</div>
          <div className="home-stat-value pink">{stats.sold.toLocaleString("es-AR")}</div>
        </div>
        <div className="home-stat">
          <div className="home-stat-label"><span className="stat-dot"></span> COMPRANDO AHORA</div>
          <div className="home-stat-value">{stats.online.toLocaleString("es-AR")}</div>
        </div>
      </div>

      <h2 className="home-section-title">SECTORES Y PRECIOS</h2>
      <p className="home-section-sub">Elegí dónde querés vivir el show. Los precios son finales por entrada, sin sorpresas al pagar.</p>

      <div className="sector-price-grid">
        {sectorData.map(sec => (
          <div className="sector-price-card" key={sec.id} onClick={() => onSectorClick(sec.id)}>
            <div className="sec-tag">{sec.tag}</div>
            <div className="sec-label">{sec.label}</div>
            <div className="sec-price">{fmtMoney(sec.price)}</div>
            <div className="sec-price-sub">POR ENTRADA</div>
            <div className="sec-progress"><div className="sec-progress-fill" style={{width: sec.pct + "%"}}></div></div>
            <div className="sec-progress-label">{sec.pct}% vendido</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// INICIO — Vista 3: cómo comprar + venta en vivo + confianza
// ---------------------------------------------------------------------------
function StepsSection({ stats }){
  const [alert, setAlert] = useState(null);
  const prevSold = useRef(null);

  useEffect(() => {
    if (prevSold.current === null) { prevSold.current = stats.sold; return; }
    if (stats.sold > prevSold.current) {
      const delta = stats.sold - prevSold.current;
      const sec = HOME_SECTORS[Math.floor(Math.random() * HOME_SECTORS.length)];
      setAlert(`Alguien compró ${delta} entrada${delta > 1 ? "s" : ""} en ${sec.label} · hace instantes`);
    }
    prevSold.current = stats.sold;
  }, [stats.sold]);

  const steps = [
    { n: "01", icon: "⚡", title: "ELEGÍ TU SECTOR", text: "Filtrá por platea, campo o palco y mirá el mapa completo del estadio." },
    { n: "02", icon: "⏱️", title: "RESERVÁ 10 MINUTOS", text: "Al tocar un asiento queda bloqueado para vos. Nadie más lo puede comprar." },
    { n: "03", icon: "🛡️", title: "PAGÁ SEGURO", text: "Transacción cifrada y entradas oficiales enviadas al instante a tu mail." },
  ];

  const trust = [
    { icon: "🔒", title: "PAGO CIFRADO", text: "Tus datos viajan protegidos de punta a punta." },
    { icon: "✅", title: "ENTRADAS OFICIALES", text: "Somos ticketera autorizada del evento." },
    { icon: "🚫", title: "SIN REVENTA", text: "Límite de 6 entradas por persona y control antibots." },
  ];

  return (
    <section className="home-section">
      <h2 className="home-section-title">COMPRAR LLEVA 3 PASOS</h2>

      <div className="steps-grid">
        {steps.map(st => (
          <div className="step-card" key={st.n}>
            <div className="step-icon">{st.icon}</div>
            <div className="step-n">{st.n}</div>
            <div className="step-title">{st.title}</div>
            <div className="step-text">{st.text}</div>
          </div>
        ))}
      </div>

      <div className={"live-alert" + (alert ? " show" : "")}>
        <span className="dot-live"></span>
        {alert || "Esperando la próxima compra…"}
      </div>

      <div className="trust-grid">
        {trust.map(t => (
          <div className="trust-card" key={t.title}>
            <div className="trust-icon">{t.icon}</div>
            <div>
              <div className="trust-title">{t.title}</div>
              <div className="trust-text">{t.text}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Home({ seats, stats, onGoToSeatmap }){
  const sectorsRef = useRef(null);

  function scrollToSectors(){
    sectorsRef.current && sectorsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <React.Fragment>
      <HeroSection onBuyClick={onGoToSeatmap} onSeeSectorsClick={scrollToSectors} />
      <SectorsSection seats={seats} stats={stats} sectionRef={sectorsRef} onSectorClick={onGoToSeatmap} />
      <StepsSection stats={stats} />
    </React.Fragment>
  );
}

// ---------------------------------------------------------------------------
// Estilos del inicio (autocontenidos: usan las variables del sitio si existen,
// y si no, caen a estos valores por defecto)
// ---------------------------------------------------------------------------
function HomeStyles(){
  return (
    <style dangerouslySetInnerHTML={{__html: `
      :root{
        --hp-bg: var(--bg, #0a0714);
        --hp-purple: var(--purple, #8b5cf6);
        --hp-green: var(--green, #22c55e);
        --hp-pink: var(--pink, #ec4899);
        --hp-red: var(--red, #ef4444);
        --hp-card: var(--card-bg, #140f22);
        --hp-border: var(--border, #29223c);
        --hp-dim: var(--text-dim, #9c94b3);
      }
      .home-hero{ position:relative; overflow:hidden; min-height:560px; display:flex; align-items:flex-end; padding:48px 64px; border-radius:0 0 24px 24px; }
      .home-hero-bg{ position:absolute; inset:0; background:
          radial-gradient(ellipse 60% 50% at 50% 20%, rgba(139,92,246,0.35), transparent 65%),
          linear-gradient(180deg, #0c0817 0%, #150c28 55%, #0a0714 100%); }
      .home-hero-rays{ position:absolute; inset:-20% -20% auto -20%; height:120%;
          background: repeating-conic-gradient(from 250deg at 50% 0%, rgba(196,168,255,0.10) 0deg 4deg, transparent 4deg 14deg);
          mix-blend-mode:screen; opacity:0.55; }
      .home-hero-stage{ position:absolute; left:50%; bottom:26%; transform:translateX(-50%); display:flex; align-items:flex-end; gap:18px; }
      .stage-silhouette{ width:34px; height:130px; border-radius:16px 16px 0 0; background:linear-gradient(180deg, rgba(20,12,32,0.9), rgba(60,30,90,0.5)); filter:blur(1px); }
      .stage-lightbar{ display:flex; gap:10px; align-items:flex-end; padding-bottom:6px; }
      .stage-lightbar span{ width:4px; height:26px; border-radius:2px; background:var(--hp-purple); opacity:0.8; box-shadow:0 0 14px 2px var(--hp-purple); }
      .home-hero-crowd{ position:absolute; left:0; right:0; bottom:0; height:22%;
          background: linear-gradient(180deg, transparent, rgba(0,0,0,0.75)); }
      .home-hero-content{ position:relative; z-index:2; max-width:760px; }
      .home-badge{ display:inline-flex; align-items:center; gap:8px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.4);
          color:#c9b6ff; font-size:11px; font-weight:800; letter-spacing:0.08em; padding:6px 14px; border-radius:999px; margin-bottom:18px; }
      .home-title{ font-size:64px; line-height:0.95; font-weight:900; letter-spacing:-0.01em; margin:0 0 18px;
          text-shadow:0 0 40px rgba(139,92,246,0.45); color:#fff; }
      .home-meta{ display:flex; flex-wrap:wrap; gap:20px; color:#c7c0da; font-size:13px; font-weight:600; margin-bottom:26px; }
      .home-cta-row{ display:flex; gap:14px; flex-wrap:wrap; }
      .btn-primary{ background:var(--hp-purple); color:#fff; border:none; font-weight:800; font-size:14px; padding:14px 26px;
          border-radius:12px; cursor:pointer; box-shadow:0 8px 24px rgba(139,92,246,0.35); }
      .btn-primary:hover{ filter:brightness(1.08); }
      .btn-outline{ background:transparent; color:#fff; border:1px solid var(--hp-border); font-weight:800; font-size:14px;
          padding:14px 26px; border-radius:12px; cursor:pointer; }
      .btn-outline:hover{ background:rgba(255,255,255,0.06); }

      .home-section{ padding:56px 64px; background:var(--hp-bg); }
      .home-stats-row{ display:grid; grid-template-columns:repeat(3,1fr); gap:24px; border-bottom:1px solid var(--hp-border); padding-bottom:32px; margin-bottom:40px; }
      .home-stat-label{ display:flex; align-items:center; gap:8px; color:var(--hp-dim); font-size:11px; font-weight:800; letter-spacing:0.06em; margin-bottom:8px; }
      .stat-dot{ width:7px; height:7px; border-radius:50%; background:var(--hp-red); display:inline-block; }
      .stat-dot.green{ background:var(--hp-green); }
      .stat-dot.pink{ background:var(--hp-pink); }
      .home-stat-value{ font-size:34px; font-weight:900; color:#fff; }
      .home-stat-value.green{ color:var(--hp-green); }
      .home-stat-value.pink{ color:var(--hp-pink); }

      .home-section-title{ font-size:28px; font-weight:900; color:#fff; margin:0 0 10px; letter-spacing:-0.01em; }
      .home-section-sub{ color:var(--hp-dim); font-size:14px; max-width:560px; margin:0 0 28px; }

      .sector-price-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
      .sector-price-card{ background:var(--hp-card); border:1px solid var(--hp-border); border-radius:14px; padding:20px; cursor:pointer; transition:transform .15s, border-color .15s; }
      .sector-price-card:hover{ transform:translateY(-3px); border-color:var(--hp-purple); }
      .sec-tag{ color:var(--hp-dim); font-size:10px; font-weight:800; letter-spacing:0.08em; margin-bottom:6px; }
      .sec-label{ color:#fff; font-weight:900; font-size:16px; margin-bottom:14px; }
      .sec-price{ color:var(--hp-purple); font-weight:900; font-size:22px; }
      .sec-price-sub{ color:var(--hp-dim); font-size:10px; font-weight:700; letter-spacing:0.06em; margin-bottom:14px; }
      .sec-progress{ height:5px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden; margin-bottom:8px; }
      .sec-progress-fill{ height:100%; background:linear-gradient(90deg, var(--hp-pink), var(--hp-red)); }
      .sec-progress-label{ color:var(--hp-dim); font-size:11px; font-weight:600; }

      .steps-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-bottom:32px; }
      .step-card{ background:var(--hp-card); border:1px solid var(--hp-border); border-radius:14px; padding:24px; }
      .step-icon{ width:38px; height:38px; border-radius:10px; background:rgba(139,92,246,0.15); display:flex; align-items:center; justify-content:center; font-size:16px; margin-bottom:14px; }
      .step-n{ color:var(--hp-dim); font-weight:800; font-size:12px; margin-bottom:6px; }
      .step-title{ color:#fff; font-weight:900; font-size:15px; margin-bottom:8px; }
      .step-text{ color:var(--hp-dim); font-size:13px; line-height:1.5; }

      .live-alert{ display:flex; align-items:center; gap:10px; background:var(--hp-card); border:1px solid var(--hp-border);
          border-radius:12px; padding:16px 20px; color:#e8e3f5; font-size:13px; font-weight:600; margin-bottom:32px; opacity:0.6; transition:opacity .3s; }
      .live-alert.show{ opacity:1; border-color:rgba(236,72,153,0.4); }

      .trust-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
      .trust-card{ display:flex; gap:14px; align-items:flex-start; background:var(--hp-card); border:1px solid var(--hp-border); border-radius:14px; padding:20px; }
      .trust-icon{ font-size:18px; }
      .trust-title{ color:#fff; font-weight:900; font-size:13px; margin-bottom:4px; letter-spacing:0.02em; }
      .trust-text{ color:var(--hp-dim); font-size:12px; line-height:1.5; }

      .home-nav-btn{ background:var(--hp-purple); color:#fff; border:none; font-weight:800; font-size:13px; padding:10px 20px; border-radius:999px; cursor:pointer; }
      .back-to-home{ background:transparent; border:1px solid var(--hp-border); color:#fff; font-weight:700; font-size:12px; padding:8px 14px; border-radius:8px; cursor:pointer; }

      @media (max-width: 900px){
        .home-hero{ padding:32px 24px; }
        .home-title{ font-size:38px; }
        .home-section{ padding:40px 24px; }
        .home-stats-row, .sector-price-grid, .steps-grid, .trust-grid{ grid-template-columns:1fr 1fr; }
      }
      @media (max-width: 560px){
        .home-stats-row, .sector-price-grid, .steps-grid, .trust-grid{ grid-template-columns:1fr; }
      }
    `}} />
  );
}

function App(){
  const { seats, stats, clientId, connected, send } = useSocket();
  const [view, setView] = useState("home"); // "home" | "seatmap"
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

  function goToSeatmap(sectorId){
    if (sectorId && sectorId !== "palcos") setSectorFilter(sectorId);
    else if (sectorId === "palcos") setSectorFilter("palco_izq");
    setView("seatmap");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome(){
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      <HomeStyles />
      <header>
        <div className="brand" style={{cursor:"pointer"}} onClick={goHome}>
          <div className="logo">🎫</div>
          <div>
            TicketNow
            <span className="sub">ENTRADAS MASIVAS</span>
          </div>
        </div>

        {view === "home" ? (
          <React.Fragment>
            <nav>
              <a className="active" onClick={goHome}>EVENTO</a>
            </nav>
            <div className="header-right">
              <button className="home-nav-btn" onClick={() => goToSeatmap()}>COMPRAR</button>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <nav>
              <a onClick={goHome}>🏠 EVENTO</a>
              <a className="active">▦ MAPA DE ASIENTOS</a>
              <a>📋 INFORMACIÓN</a>
              <a>FAQ</a>
              <a>CONTACTO</a>
            </nav>
            <div className="header-right">
              <div className="cart-btn">🛒<span className="cart-badge">{mySeats.length}</span></div>
              <div className="account">👤 Mi cuenta ▾</div>
            </div>
          </React.Fragment>
        )}
      </header>

      {view === "home" && (
        <Home seats={seats} stats={stats} onGoToSeatmap={goToSeatmap} />
      )}

      {view === "seatmap" && (
        <React.Fragment>
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

          <div style={{padding:"0 64px", marginTop:12}}>
            <button className="back-to-home" onClick={goHome}>← Volver al inicio</button>
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
        </React.Fragment>
      )}

      <div className="conn-badge">
        <span className={"conn-dot " + (connected ? "ok" : "bad")}></span>
        {connected ? "Conectado en tiempo real" : "Reconectando..."}
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);