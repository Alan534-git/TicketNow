

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const DEFAULT_PORT = Number(process.env.PORT || 3001);
const MAX_PORT = 3100;
const RESERVATION_MS = 10 * 60 * 1000; // 10 minutos de reserva temporal

// ---------------------------------------------------------------------------
// 1. GENERACIÓN DEL MAPA DE ASIENTOS (estado central, única fuente de verdad)
// ---------------------------------------------------------------------------
const SECTORS = [
  { id: "platea_baja", label: "Platea Baja", price: 12500, rows: 10, seatsPerRow: 26 },
  { id: "platea_alta", label: "Platea Alta", price: 9000, rows: 10, seatsPerRow: 30 },
  { id: "campo", label: "Campo", price: 8000, rows: 12, seatsPerRow: 24 },
  { id: "palco_izq", label: "Palco Izquierdo", price: 18000, rows: 6, seatsPerRow: 6 },
  { id: "palco_der", label: "Palco Derecho", price: 18000, rows: 6, seatsPerRow: 6 },
];

/** seats: Map<seatId, seatObject>  — estado en memoria (server-authoritative) */
const seats = new Map();

function buildSeats() {
  SECTORS.forEach((sector) => {
    for (let r = 1; r <= sector.rows; r++) {
      for (let s = 1; s <= sector.seatsPerRow; s++) {
        const id = `${sector.id}-${r}-${s}`;
        // Pequeño porcentaje ya vendido al ararancar, para simular un evento real
        const preSold = Math.random() < 0.06;
        seats.set(id, {
          id,
          sector: sector.id,
          sectorLabel: sector.label,
          row: r,
          seat: s,
          price: sector.price,
          status: preSold ? "sold" : "available", // available | selected | sold
          ownerId: null,
          expiresAt: null,
        });
      }
    }
  });
}
buildSeats();

let totalSold = 1326; // arranca con un valor "en vivo" simulando ventas previas

// ---------------------------------------------------------------------------
// 2. SERVIDOR HTTP + WEBSOCKET
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** clients: Map<clientId, wsSocket> */
const clients = new Map();

function seatsArray() {
  return Array.from(seats.values());
}

function stats() {
  const available = seatsArray().filter((s) => s.status === "available").length;
  const sold = seatsArray().filter((s) => s.status === "sold").length;
  return {
    available,
    sold: sold + totalSold,
    online: clients.size,
  };
}

function broadcastState() {
  const payload = JSON.stringify({
    type: "state",
    seats: seatsArray(),
    stats: stats(),
    ts: Date.now(),
  });
  for (const ws of clients.values()) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

/** Libera automáticamente los asientos cuya reserva venció (sin comprar) */
function releaseExpiredSeats() {
  let changed = false;
  const now = Date.now();
  for (const seat of seats.values()) {
    if (seat.status === "selected" && seat.expiresAt && seat.expiresAt <= now) {
      seat.status = "available";
      seat.ownerId = null;
      seat.expiresAt = null;
      changed = true;
    }
  }
  if (changed) broadcastState();
}
// Barrido periódico de reservas vencidas (mantiene el sistema estable y consistente)
setInterval(releaseExpiredSeats, 1000);

/** Libera todos los asientos que un cliente tenía tomados al desconectarse */
function releaseSeatsOfClient(clientId) {
  let changed = false;
  for (const seat of seats.values()) {
    if (seat.ownerId === clientId && seat.status === "selected") {
      seat.status = "available";
      seat.ownerId = null;
      seat.expiresAt = null;
      changed = true;
    }
  }
  return changed;
}

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  ws.isAlive = true;

  // Bienvenida: le decimos al cliente quién es y le mandamos el estado completo
  ws.send(JSON.stringify({ type: "welcome", clientId }));
  ws.send(JSON.stringify({ type: "state", seats: seatsArray(), stats: stats(), ts: Date.now() }));

  // Avisamos a todos que hay una persona más en línea
  broadcastState();

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // mensaje malformado, se ignora sin tumbar el servidor
    }

    if (msg.type === "select") {
      const seat = seats.get(msg.seatId);
      if (seat && seat.status === "available") {
        seat.status = "selected";
        seat.ownerId = clientId;
        seat.expiresAt = Date.now() + RESERVATION_MS;
        broadcastState();
      }
    }

    if (msg.type === "deselect") {
      const seat = seats.get(msg.seatId);
      if (seat && seat.status === "selected" && seat.ownerId === clientId) {
        seat.status = "available";
        seat.ownerId = null;
        seat.expiresAt = null;
        broadcastState();
      }
    }

    if (msg.type === "purchase") {
      const ids = Array.isArray(msg.seatIds) ? msg.seatIds : [];
      let count = 0;
      ids.forEach((id) => {
        const seat = seats.get(id);
        if (seat && seat.status === "selected" && seat.ownerId === clientId) {
          seat.status = "sold";
          seat.ownerId = null;
          seat.expiresAt = null;
          count++;
        }
      });
      if (count > 0) {
        totalSold += count;
        broadcastState();
        ws.send(JSON.stringify({ type: "purchase_ok", count }));
      }
    }
  });

  ws.on("close", () => {
    clients.delete(clientId);
    const changed = releaseSeatsOfClient(clientId);
    // Siempre notificamos (aunque no haya cambiado asientos) porque bajó "online"
    broadcastState();
  });

  ws.on("error", () => {
    // Nunca dejamos que un error de un socket individual tumbe el servidor
    clients.delete(clientId);
  });
});

// Heartbeat: detecta conexiones muertas (ventanas cerradas de golpe, cortes de red)
// y las limpia, para que "Personas en línea" y el estado se mantengan reales
// incluso bajo flujo continuo de datos.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

// Simula "ventas en vivo" externas ocasionales (otro comprador en la web)
// para que el contador global se mueva incluso sin interacción, tal como el mockup.
setInterval(() => {
  const availableSeats = seatsArray().filter((s) => s.status === "available");
  if (availableSeats.length > 5 && Math.random() < 0.15) {
    const pick = availableSeats[Math.floor(Math.random() * availableSeats.length)];
    pick.status = "sold";
    totalSold += 1;
    broadcastState();
  }
}, 4000);

function startServer(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      if (nextPort <= MAX_PORT) {
        console.warn(`Puerto ${port} ocupado. Intentando ${nextPort}...`);
        startServer(nextPort);
        return;
      }
      console.error(`No hay puertos disponibles desde ${DEFAULT_PORT} hasta ${MAX_PORT}.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`TicketNow escuchando en http://localhost:${port}`);
  });
}

startServer(DEFAULT_PORT);
