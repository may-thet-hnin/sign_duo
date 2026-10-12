# LAN multiplayer

## How the devices connect

The app is a static site (for example on Vercel), so there is no game server.
The two browsers connect to each other directly with **WebRTC** data channels:

| Step | How |
|---|---|
| Finding the host | The host registers the peer id `sign-duo-lan-v1-<code>` with the free public PeerJS signaling server; the guest asks for the same id. Only this handshake uses the server. |
| Gameplay | A reliable WebRTC data channel between the two devices. On the same Wi-Fi it stays on the local network. |
| Match authority | `src/lan/lanHost.js`, running in the host's page, with the same `RaceEngine` as Duo Mode. |

A plain web page cannot run a server or discover LAN devices, and an `https`
site may not open `ws://` connections to private addresses, so WebRTC is the
way two browsers can talk directly. Every message is validated
(`src/lan/protocol.js`), messages are capped at 4 KB and lobbies at two
players, and only the host's own page can create a lobby.

Some networks block peer-to-peer traffic between devices (guest Wi-Fi with
"client isolation"). There, the join step reports that it could not connect
to the host; use a normal home or hotspot network.

## Match flow

1. **Lobby:** host gets a 6-character code (no look-alike characters). The
   guest joins by code; both see names, connection and ready status. The host
   sets signs and length.
2. **Preparing:** on Start, each device mounts its game camera and reports when
   recognition is ready (20 s limit, then back to the lobby).
3. **Countdown:** the host sets a start time 3 s ahead. The guest shows the
   countdown and match timer from the host's clock, using an offset measured
   from heartbeat round trips.
4. **Playing:** each device recognizes signs locally and sends only
   `{ letter, eventId, challengeId }`. The engine ignores repeated event IDs and
   stale challenges, so duplicate packets, repeated frames and late messages
   cannot double-score. State is broadcast on every change and four times a
   second.
5. **Results:** both devices show the same authoritative results. **Play
   again** starts a new match when both agree; **Return to lobby** resets ready.

## Connection problems

| Situation | Behaviour |
|---|---|
| Guest's link drops | Heartbeats (every 2 s, 7 s timeout) detect it. The guest retries for 30 s ("Connection lost. Attempting to reconnect..."); the host's match pauses ("Opponent disconnected") and the paused time is added back on resume. |
| Guest reloads | **Rejoin my lobby** (seat token kept in the tab's session storage). |
| Guest gone for 30 s | The host wins by forfeit; in the lobby the seat is freed. |
| Host closes or reloads the page | The match ends for both: "The host closed the match." (The host's page holds the match, so it cannot be resumed.) |
| Wrong code / full lobby | "Lobby not found. Please check your invite code." / "This lobby already has two players." |

## Testing

`tests/lanHost.test.mjs` drives the match authority with in-memory
connections: lobby join, wrong code, full lobby, host-only actions, a full
match with duplicate, stale and simultaneous events, pause and resume,
forfeit, host leaving and rematch. To try the real connection on one
computer, open the site in two browser windows (keep both visible: hidden tabs
throttle the camera loop).
