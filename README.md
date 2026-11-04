# TicketNow — Mapa de asientos en tiempo real

MVP que cumple los requerimientos técnicos del CTO:

- **Frontend**: interfaz reactiva (React 18, componentes: `Seat`, `SectorBlock`, `App`) con UI dinámica — sin paso de build, corre directo desde `public/index.html`.
- **Backend**: servidor Node.js (Express + `ws`) que mantiene canales WebSocket persistentes y abiertos con cada cliente. El estado de los asientos vive en memoria (sin bases de datos ni polling).
- **Fluidez**: cada cambio (seleccionar, liberar, comprar) se **empuja (push)** desde el servidor a todos los clientes conectados en milisegundos vía `broadcastState()`.
hola 
## Cómo correrlo

```bash
npm install
npm start
```

Abrí `http://localhost:3001` en **tres pestañas/navegadores distintos** (2 simulando clientes, 1 simulando el operador/admin viendo el mismo mapa) — la prueba de aceptación del documento (punto 4).

## Cómo probar el Criterio de Aceptación (DoD)

1. Abrí 3 navegadores apuntando a `http://localhost:3000`.
2. En uno de ellos, hacé clic en un asiento verde (disponible) → verás que se pone amarillo en TODAS las ventanas al instante.
3. Agregalo al carrito y hacé clic en "Continuar compra" → el asiento se pone rojo (vendido) en las 3 ventanas simultáneamente.
4. Los contadores "Contador Global", "Ventas en vivo" y "Personas en línea" se actualizan solos en tiempo real en todas las ventanas.
5. Si no comprás dentro de los 10 minutos, el asiento se libera automáticamente y vuelve a verde en todas las ventanas (reserva temporal con expiración server-side).
6. Estabilidad: el servidor corre un heartbeat cada 15s para limpiar conexiones muertas y un barrido cada 1s para liberar reservas vencidas, sin degradar memoria ni caerse bajo uso continuo.

## Estructura

```
ticketnow/
├── server.js         # Backend: estado en memoria + WebSocket + Express
├── package.json
├── src_app.jsx       # Fuente React (editable)
└── public/
    ├── index.html    # HTML (carga los scripts locales, sin CDN)
    ├── app.js         # React ya PRECOMPILADO desde src_app.jsx (npm run build)
    └── vendor/        # React y ReactDOM guardados localmente (sin internet)
```

## Importante: abrí siempre `http://localhost:3001`

No abras `public/index.html` con doble clic ni desde el preview interno del
editor (VS Code Simple Browser, etc.) — esos entornos bloquean WebSockets y
scripts. Tiene que ser el navegador real apuntando a la URL del servidor
Node corriendo (`npm start`).

Todo el proyecto corre 100% local: no depende de ninguna CDN externa
(React, ReactDOM y el bundle de la app ya están precompilados y copiados
dentro de `public/`), así que funciona incluso sin conexión a internet o
detrás de un firewall/antivirus restrictivo.

Si editás `src_app.jsx`, recompilá con:

```bash
npm run build
```

(esto regenera `public/app.js`).
