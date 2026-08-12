const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;
const SECTOR_META = {
  platea_baja: {
    label: "Platea Baja"
  },
  platea_alta: {
    label: "Platea Alta"
  },
  campo: {
    label: "Campo"
  },
  palco_izq: {
    label: "Palco"
  },
  palco_der: {
    label: "Palco"
  }
};
function fmtMoney(n) {
  return "$ " + n.toLocaleString("es-AR");
}
function fmtCountdown(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function useSocket() {
  const [seats, setSeats] = useState([]);
  const [stats, setStats] = useState({
    available: 0,
    sold: 0,
    online: 0
  });
  const [clientId, setClientId] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  useEffect(() => {
    let retryTimer;
    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 1500); // reconexión automática
      };
      ws.onerror = () => ws.close();
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "welcome") setClientId(msg.clientId);
        if (msg.type === "state") {
          setSeats(msg.seats);
          setStats(msg.stats);
        }
      };
    }
    connect();
    return () => {
      clearTimeout(retryTimer);
      wsRef.current && wsRef.current.close();
    };
  }, []);
  const send = useCallback(obj => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);
  return {
    seats,
    stats,
    clientId,
    connected,
    send
  };
}
function Seat({
  seat,
  mine,
  onHover,
  onClick
}) {
  const cls = ["seat", seat.status, mine ? "mine" : ""].join(" ").trim();
  return /*#__PURE__*/React.createElement("div", {
    className: cls,
    onMouseEnter: e => onHover(seat, e),
    onClick: () => seat.status === "available" || mine ? onClick(seat) : null,
    title: `Fila ${seat.row} - Asiento ${seat.seat}`
  });
}
function SectorBlock({
  title,
  seats,
  myId,
  onHover,
  onClick
}) {
  const byRow = useMemo(() => {
    const map = {};
    seats.forEach(s => {
      (map[s.row] = map[s.row] || []).push(s);
    });
    return Object.keys(map).sort((a, b) => a - b).map(r => map[r].sort((a, b) => a.seat - b.seat));
  }, [seats]);
  return /*#__PURE__*/React.createElement("div", {
    className: "sector-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sector-name"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "rows"
  }, byRow.map((row, i) => /*#__PURE__*/React.createElement("div", {
    className: "row",
    key: i
  }, row.map(seat => /*#__PURE__*/React.createElement(Seat, {
    key: seat.id,
    seat: seat,
    mine: seat.ownerId === myId,
    onHover: onHover,
    onClick: onClick
  }))))));
}
function App() {
  const {
    seats,
    stats,
    clientId,
    connected,
    send
  } = useSocket();
  const [sectorFilter, setSectorFilter] = useState("todos");
  const [tooltip, setTooltip] = useState(null); // {seat, x, y}
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const mySeats = useMemo(() => seats.filter(s => s.status === "selected" && s.ownerId === clientId), [seats, clientId]);
  const earliestExpiry = useMemo(() => {
    if (mySeats.length === 0) return null;
    return Math.min(...mySeats.map(s => s.expiresAt));
  }, [mySeats]);
  const subtotal = mySeats.reduce((acc, s) => acc + s.price, 0);
  const serviceFee = Math.round(subtotal * 0.10);
  const total = subtotal + serviceFee;
  const sectors = ["platea_baja", "platea_alta", "campo", "palco_izq", "palco_der"];
  const visibleSectors = sectorFilter === "todos" ? sectors : [sectorFilter];
  function handleHover(seat, e) {
    if (seat.status === "sold") {
      setTooltip(null);
      return;
    }
    const rect = e.target.getBoundingClientRect();
    setTooltip({
      seat,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 6
    });
  }
  function handleSelect(seat) {
    if (seat.ownerId === clientId && seat.status === "selected") {
      send({
        type: "deselect",
        seatId: seat.id
      });
    } else if (seat.status === "available") {
      send({
        type: "select",
        seatId: seat.id
      });
    }
    setTooltip(null);
  }
  function removeFromCart(seatId) {
    send({
      type: "deselect",
      seatId
    });
  }
  function checkout() {
    if (mySeats.length === 0) return;
    send({
      type: "purchase",
      seatIds: mySeats.map(s => s.id)
    });
  }
  const filterButtons = [{
    id: "todos",
    label: "Todos"
  }, {
    id: "platea_baja",
    label: "Platea Baja"
  }, {
    id: "platea_alta",
    label: "Platea Alta"
  }, {
    id: "campo",
    label: "Campo"
  }, {
    id: "palco_izq",
    label: "Palcos"
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "logo"
  }, "\uD83C\uDFAB"), /*#__PURE__*/React.createElement("div", null, "TicketNow", /*#__PURE__*/React.createElement("span", {
    className: "sub"
  }, "ENTRADAS MASIVAS"))), /*#__PURE__*/React.createElement("nav", null, /*#__PURE__*/React.createElement("a", {
    className: "active"
  }, "\uD83C\uDFE0 EVENTO"), /*#__PURE__*/React.createElement("a", null, "\u25A6 MAPA DE ASIENTOS"), /*#__PURE__*/React.createElement("a", null, "\uD83D\uDCCB INFORMACI\xD3N"), /*#__PURE__*/React.createElement("a", null, "FAQ"), /*#__PURE__*/React.createElement("a", null, "CONTACTO")), /*#__PURE__*/React.createElement("div", {
    className: "header-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cart-btn"
  }, "\uD83D\uDED2", /*#__PURE__*/React.createElement("span", {
    className: "cart-badge"
  }, mySeats.length)), /*#__PURE__*/React.createElement("div", {
    className: "account"
  }, "\uD83D\uDC64 Mi cuenta \u25BE"))), /*#__PURE__*/React.createElement("div", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-event"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-thumb"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "CONCIERTO DEL A\xD1O"), /*#__PURE__*/React.createElement("h1", null, "NOCHE INOLVIDABLE"), /*#__PURE__*/React.createElement("div", {
    className: "hero-meta"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCCD Estadio \xDAnico de La Plata"), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCC5 S\xE1bado 21 de Diciembre, 2024 \u2022 21:00 hs")))), /*#__PURE__*/React.createElement("div", {
    className: "stats-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "\uD83D\uDD50 CONTADOR GLOBAL"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value green"
  }, stats.available), /*#__PURE__*/React.createElement("div", {
    className: "stat-sub"
  }, "entradas disponibles")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "\uD83D\uDCE1 VENTAS EN VIVO"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, stats.sold.toLocaleString("es-AR")), /*#__PURE__*/React.createElement("div", {
    className: "stat-sub"
  }, "entradas vendidas")), /*#__PURE__*/React.createElement("div", {
    className: "stat-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot-live"
  }), " PERSONAS EN L\xCDNEA"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, stats.online.toLocaleString("es-AR")), /*#__PURE__*/React.createElement("div", {
    className: "stat-sub"
  }, "comprando ahora")))), /*#__PURE__*/React.createElement("div", {
    className: "layout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "step-num"
  }, "1"), " SELECCION\xC1 SECTOR"), /*#__PURE__*/React.createElement("div", {
    className: "sector-grid"
  }, filterButtons.map((b, i) => /*#__PURE__*/React.createElement("button", {
    key: b.id,
    className: "sector-btn" + (sectorFilter === b.id ? " active" : ""),
    style: i === 0 ? {
      gridColumn: "span 2"
    } : {},
    onClick: () => setSectorFilter(b.id)
  }, b.label))), /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "step-num"
  }, "2"), " ELEG\xCD TUS ASIENTOS"), /*#__PURE__*/React.createElement("div", {
    className: "legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "legend-dot",
    style: {
      background: "var(--green)"
    }
  }), " Disponible"), /*#__PURE__*/React.createElement("div", {
    className: "legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "legend-dot",
    style: {
      background: "var(--red)"
    }
  }), " Ocupado"), /*#__PURE__*/React.createElement("div", {
    className: "legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "legend-dot",
    style: {
      background: "var(--yellow)"
    }
  }), " Seleccionado"), /*#__PURE__*/React.createElement("div", {
    className: "legend-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "legend-dot",
    style: {
      background: "var(--gray)"
    }
  }), " No disponible"), /*#__PURE__*/React.createElement("div", {
    className: "info-box"
  }, "\uD83D\uDEE1\uFE0F ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Compra 100% segura"), /*#__PURE__*/React.createElement("br", null), "Tus datos y pagos est\xE1n protegidos. Transacci\xF3n cifrada."))), /*#__PURE__*/React.createElement("div", {
    className: "panel map-panel",
    style: {
      position: "relative"
    },
    onMouseLeave: () => setTooltip(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "stage"
  }, "ESCENARIO"), /*#__PURE__*/React.createElement("div", {
    className: "seatmap"
  }, sectorFilter === "todos" && /*#__PURE__*/React.createElement("div", {
    className: "palcos-row"
  }, /*#__PURE__*/React.createElement(SectorBlock, {
    title: "PALCO",
    seats: seats.filter(s => s.sector === "palco_izq"),
    myId: clientId,
    onHover: handleHover,
    onClick: handleSelect
  }), /*#__PURE__*/React.createElement(SectorBlock, {
    title: "PALCO",
    seats: seats.filter(s => s.sector === "palco_der"),
    myId: clientId,
    onHover: handleHover,
    onClick: handleSelect
  })), visibleSectors.filter(s => s !== "palco_der").map(sec => {
    if (sec === "palco_izq" && sectorFilter === "todos") return null;
    const label = sec === "palco_izq" ? "PALCO IZQUIERDO" : sec === "palco_der" ? "PALCO DERECHO" : SECTOR_META[sec].label.toUpperCase();
    return /*#__PURE__*/React.createElement(SectorBlock, {
      key: sec,
      title: label,
      seats: seats.filter(s => s.sector === sec),
      myId: clientId,
      onHover: handleHover,
      onClick: handleSelect
    });
  })), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "\uD83D\uDC46 Hac\xE9 clic sobre un asiento para seleccionarlo"), tooltip && /*#__PURE__*/React.createElement("div", {
    className: "tooltip",
    style: {
      left: tooltip.x,
      top: tooltip.y
    }
  }, /*#__PURE__*/React.createElement("b", null, SECTOR_META[tooltip.seat.sector]?.label || tooltip.seat.sectorLabel), "Fila ", tooltip.seat.row, " - Asiento ", tooltip.seat.seat, /*#__PURE__*/React.createElement("div", {
    className: "price"
  }, fmtMoney(tooltip.seat.price)), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleSelect(tooltip.seat)
  }, tooltip.seat.ownerId === clientId ? "Quitar" : "Seleccionar"))), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "step-num"
  }, "3"), " TUS ASIENTOS (", mySeats.length, ")", mySeats.length > 0 && /*#__PURE__*/React.createElement("a", {
    style: {
      marginLeft: "auto",
      color: "var(--purple)",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer"
    },
    onClick: () => mySeats.forEach(s => removeFromCart(s.id))
  }, "Limpiar todo")), mySeats.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "cart-empty"
  }, "Todav\xEDa no seleccionaste asientos."), mySeats.map(s => /*#__PURE__*/React.createElement("div", {
    className: "cart-item",
    key: s.id
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sec"
  }, SECTOR_META[s.sector]?.label), /*#__PURE__*/React.createElement("div", {
    className: "row-seat"
  }, "Fila ", s.row, " - Asiento ", s.seat), /*#__PURE__*/React.createElement("div", {
    className: "price"
  }, fmtMoney(s.price))), /*#__PURE__*/React.createElement("button", {
    className: "remove-btn",
    onClick: () => removeFromCart(s.id)
  }, "\u2715"))), mySeats.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "totals-row"
  }, /*#__PURE__*/React.createElement("span", null, "Subtotal"), /*#__PURE__*/React.createElement("span", null, fmtMoney(subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "totals-row"
  }, /*#__PURE__*/React.createElement("span", null, "Cargo por servicio"), /*#__PURE__*/React.createElement("span", null, fmtMoney(serviceFee))), /*#__PURE__*/React.createElement("div", {
    className: "total-row"
  }, /*#__PURE__*/React.createElement("span", null, "TOTAL"), /*#__PURE__*/React.createElement("span", null, fmtMoney(total)))), /*#__PURE__*/React.createElement("button", {
    className: "buy-btn",
    disabled: mySeats.length === 0,
    onClick: checkout
  }, "\uD83D\uDD12 Continuar compra"), earliestExpiry && /*#__PURE__*/React.createElement("div", {
    className: "timer-box"
  }, /*#__PURE__*/React.createElement("span", null, "\xA1Las entradas se reservan por 10 minutos!"), /*#__PURE__*/React.createElement("span", {
    className: "timer-val"
  }, "\uD83D\uDD50 ", fmtCountdown(earliestExpiry - now))))), /*#__PURE__*/React.createElement("div", {
    className: "conn-badge"
  }, /*#__PURE__*/React.createElement("span", {
    className: "conn-dot " + (connected ? "ok" : "bad")
  }), connected ? "Conectado en tiempo real" : "Reconectando..."));
}
// Compatibilidad con React < 18: si `createRoot` no está disponible, usar `ReactDOM.render`.
const _rootEl = document.getElementById("root");
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(_rootEl).render(React.createElement(App, null));
} else {
  ReactDOM.render(React.createElement(App, null), _rootEl);
}
