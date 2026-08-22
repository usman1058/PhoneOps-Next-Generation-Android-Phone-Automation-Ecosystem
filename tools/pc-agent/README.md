# PhoneOps PC Agent

Streams this Windows PC's screen to your phone and lets the phone control
mouse + keyboard — routed through the relay, so it works over mobile data
with **no port forwarding**.

## One-time setup

```cmd
cd tools\pc-agent
npm install
```

## Run

```cmd
set RELAY_URL=https://phoneops-relay.onrender.com
set RELAY_INTERNAL_SECRET=<same secret as relay-service>
start-agent.cmd
```

Optional tuning: `AGENT_NAME` (shown in the phone app), `PC_FPS` (1-10),
`PC_WIDTH` (400-1600), `PC_QUALITY` (20-90).

## Use it

1. Open **Automation Companion** on the phone -> **PC Remote**
2. Pick this PC from the list and tap **Connect**
3. The phone now shows your PC screen:
   - Tap = left click at that point
   - Drag = click-and-drag
   - Text box / key buttons type into the focused window

The agent must keep running for the connection to stay alive. Close the
window to disconnect.
