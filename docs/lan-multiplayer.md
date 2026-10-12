# LAN multiplayer

## Why a helper process

A web page cannot run a server or discover other devices, and browsers only
allow cameras on secure pages (`localhost` or HTTPS). So each device opens the
app on its own `localhost`, and a small Node helper (`npm run lan`, included in
`npm run dev:lan`) handles the network:

| Job | How |
|---|---|
| Lobby and match authority | WebSocket server on TCP **5180** of the host's helper (`server/lanRelay.js`) |
| Finding a lobby by code | UDP broadcast on port **5181**; the helper hosting that code answers with its address |
| Fallback | The guest types the host address shown in the host's lobby |

No cloud service is used. The helper accepts connections only from local or
private-network page origins, validates every message (`src/lan/protocol.js`),
caps messages at 4 KB and lobbies at two players.

## Match flow

1. **Lobby:** host creates a 6-character code (no look-alike characters). The
   guest joins by code; both see names, connection and ready status. The host
   sets signs and length.
2. **Preparing:** on Start, each device mounts its game camera and reports when
   recognition is ready (20 s limit, then back to the lobby).
3. **Countdown:** the host's helper sets a start time 3 s ahead; clients show
   the countdown and match timer from server time, using a clock offset measured
   with ping round trips.
4. **Playing:** the host's helper runs `RaceEngine` (versus mode) as in Duo.
   Each device recognizes signs locally and sends only `{ letter, eventId,
   challengeId }`. The engine ignores repeated event IDs and stale challenges,
   so duplicate packets, repeated frames and late messages cannot double-score.
   Every change is broadcast; scores also refresh four times a second.
5. **Results:** both devices show the same authoritative results. **Play
   again** starts a new match when both agree; **Return to lobby** resets ready.

## Connection problems

| Situation | Behaviour |
|---|---|
| A player's connection drops | Their device retries for 30 s ("Connection lost. Attempting to reconnect..."). The match pauses ("Opponent disconnected"), and the paused time is added back on resume. |
| Page reload | **Rejoin my lobby** (seat token kept in the tab's session storage). |
| No return within 30 s | The remaining player wins by forfeit; in the lobby the seat is freed. |
| Host leaves or its helper stops | The match closes for both: "The host closed the match." |
| Wrong code / full lobby | "Lobby not found. Please check your invite code." / "This lobby already has two players." |

## Testing

`tests/lanRelay.test.mjs` runs real WebSocket clients against helper
instances: lobby join, wrong code, full lobby, host-only actions, a full match
with duplicate, stale and simultaneous events, pause and resume, forfeit, host
leaving, rematch, and UDP discovery between two helpers.

To try it on one computer, run `LAN_HOST=127.0.0.1 npm run lan` plus
`npm run dev`, and use two browser windows (keep both visible: hidden tabs
throttle the camera loop).
