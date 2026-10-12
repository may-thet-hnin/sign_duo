// LAN multiplayer protocol, shared by the browser client and the Node LAN
// helper (server/lanRelay.js). Messages are small JSON objects with a `type`.
import { COMPETITION_POOLS, RACE_DURATIONS, SUPPORTED_SIGNS } from '../recognition/config.js';

export const LAN_WS_PORT = 5180;
export const LAN_DISCOVERY_PORT = 5181;
export const LAN_DISCOVERY_MS = 2500;
// How long a disconnected player's place (and a paused match) is held.
export const RECONNECT_GRACE_MS = 30000;
// Countdown after both cameras are ready, so both devices start together.
export const START_COUNTDOWN_MS = 3000;
export const MAX_MESSAGE_BYTES = 4096;

// Invite codes avoid look-alike characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function makeInviteCode(random = Math.random) {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length]).join('');
}

/** Upper-case, drop spaces/dashes; returns a valid code or null. */
export function normalizeInviteCode(text) {
  const code = String(text ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

export function cleanName(name, fallback) {
  // Keep printable characters only (no control characters or angle brackets).
  const text = [...String(name ?? '')].filter(ch => ch >= ' ' && ch !== '<' && ch !== '>').join('').trim().slice(0, 20);
  return text || fallback;
}

const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// Allowed client messages and the checks for their fields.
const CLIENT_MESSAGES = {
  ping: m => Number.isFinite(m.t),
  find: m => CODE_PATTERN.test(m.code ?? ''),
  create: m => m.name === undefined || typeof m.name === 'string',
  join: m => CODE_PATTERN.test(m.code ?? '') && (m.name === undefined || typeof m.name === 'string'),
  rejoin: m => CODE_PATTERN.test(m.code ?? '') && isText(m.token, 64),
  name: m => typeof m.name === 'string',
  ready: m => typeof m.ready === 'boolean',
  settings: m => RACE_DURATIONS.includes(m.durationSeconds) && Object.hasOwn(COMPETITION_POOLS, m.vocabulary),
  start: () => true,
  cameraReady: m => typeof m.ready === 'boolean',
  sign: m => SUPPORTED_SIGNS.competition.includes(m.letter) && isText(m.eventId, 80) && isText(m.challengeId, 80),
  skip: m => isText(m.challengeId, 80),
  rematch: () => true,
  toLobby: () => true,
  leave: () => true,
};

/** Parse and validate one client message. Returns { ok, message } or { ok: false, error }. */
export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'bad_message' };
  let message;
  try { message = JSON.parse(raw); } catch { return { ok: false, error: 'bad_message' }; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { ok: false, error: 'bad_message' };
  const check = CLIENT_MESSAGES[message.type];
  if (!check || !check(message)) return { ok: false, error: 'bad_message' };
  return { ok: true, message };
}

// User-facing text for errors the helper sends.
export const LAN_ERRORS = Object.freeze({
  not_found: 'Lobby not found. Please check your invite code.',
  full: 'This lobby already has two players.',
  in_progress: 'That match has already started.',
  bad_message: 'The game sent an invalid message.',
  not_host: 'Only the host can do that.',
  not_ready: 'Both players must be connected and ready.',
  expired: 'Your place in the lobby has expired. Join again with the invite code.',
  no_helper: 'The LAN helper is not running on this device. Start it with "npm run lan", then try again.',
  unreachable: 'Could not reach the host. Check that both devices are on the same network.',
  camera: 'A camera did not start in time. Check camera access and try again.',
});

/** True for loopback and private-network page origins (the only pages allowed to connect). */
export function isLocalOrigin(origin) {
  if (!origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  return host === 'localhost' || host === '[::1]' || host === '::1' || /^127\./.test(host) ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
}
