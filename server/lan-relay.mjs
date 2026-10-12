// Start the Sign Duo LAN helper: `npm run lan` (or `npm run dev:lan` for the app and helper together).
import { createLanRelay, lanInterfaces } from './lanRelay.js';
import { LAN_WS_PORT, LAN_DISCOVERY_PORT } from '../src/lan/protocol.js';

// LAN_HOST=127.0.0.1 keeps the helper on this machine only (two tabs, no firewall prompt).
const relay = createLanRelay({ host: process.env.LAN_HOST || '0.0.0.0', log: message => console.log(`[lan] ${message}`) });
try {
  await relay.ready;
} catch (error) {
  console.error(`[lan] Could not start: ${error.message}`);
  console.error(`[lan] Is another helper already running? It needs TCP ${LAN_WS_PORT} and UDP ${LAN_DISCOVERY_PORT}.`);
  process.exit(1);
}
const addresses = lanInterfaces().map(i => i.address);
console.log(`[lan] Sign Duo LAN helper ready on port ${LAN_WS_PORT} (discovery UDP ${LAN_DISCOVERY_PORT}).`);
console.log(`[lan] This device on the network: ${addresses.join(', ') || 'no network found'}`);
console.log('[lan] Allow Node.js through the firewall on private networks if asked.');

const stop = async () => { await relay.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
