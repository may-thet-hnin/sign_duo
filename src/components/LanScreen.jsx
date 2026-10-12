import { useEffect, useRef, useState } from 'react';
import PixelSprite from './Pixel.jsx';
import ResultsScreen from './ResultsScreen.jsx';
import ResultsReveal from './ResultsReveal.jsx';
import { RacePlayer } from './RaceScreen.jsx';
import { LanClient } from '../lan/lanClient.js';
import { LAN_ERRORS, START_COUNTDOWN_MS, normalizeInviteCode, cleanName } from '../lan/protocol.js';
import { RACE_DURATIONS, SKIPS_PER_RACE, SUCCESS_PAUSE_MS } from '../recognition/config.js';

const NAME_KEY = 'sign-duo-lan-name';
// Prefixes this page's recognition event IDs so a reload never repeats one.
const PAGE_NONCE = Math.random().toString(36).slice(2, 10);
const SAVED_SESSION_KEY = 'sign-duo-lan-session';
const VOCABULARIES = [['alphabet', 'Alphabet'], ['words', 'Basic Words'], ['mixed', 'Mixed']];
const CLOSED_MESSAGES = {
  host_left: 'The host closed the match.',
  opponent_left: LAN_ERRORS.expired,
  connection_lost: 'Connection lost. Could not reconnect to the host.',
  lobby_gone: 'That lobby has closed. Create or join a new one.',
};

const readName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const hasSavedSession = () => { try { return Boolean(sessionStorage.getItem(SAVED_SESSION_KEY)); } catch { return false; } };
const errorText = code => LAN_ERRORS[code] ?? (typeof code === 'string' && code.length > 20 ? code : 'Something went wrong. Please try again.');

function asResultPlayer(player) {
  return { id: player.id, name: player.name, score: player.score, lives: 0, maxLives: 0, correct: player.correct,
    attempts: player.correct + player.mistakes, bestStreak: player.bestStreak, spm: player.spm, skipped: player.skipped };
}

/**
 * LAN multiplayer: two devices on the same network, each with its own camera
 * and recognition. The host's LAN helper (server/lanRelay.js) runs the lobby
 * and the authoritative match; this screen sends recognized signs and shows
 * the synced state.
 */
export default function LanScreen({ initialSettings, cameraId, onExit }) {
  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  const stateRef = useRef(null);
  const lastAttemptRef = useRef(null);
  const cameraReadyRef = useRef(false);
  const cameraReadySentRef = useRef(false);
  const [view, setView] = useState('menu');
  const [name, setName] = useState(readName);
  const [codeInput, setCodeInput] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [state, setState] = useState(null);
  const [session, setSession] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [recognition, setRecognition] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [canResume, setCanResume] = useState(hasSavedSession);

  const phase = state?.phase ?? null;
  const players = state?.match?.snapshot?.players ?? [];
  const me = players.find(p => p.id === session?.playerId) ?? null;
  const opponent = players.find(p => p.id !== session?.playerId) ?? null;
  const lobbyMe = state?.players.find(p => p.id === session?.playerId);
  const lobbyOpponent = state?.players.find(p => p.id !== session?.playerId);

  function send(message) { return clientRef.current?.send(message); }

  function handleState(message) {
    const previous = stateRef.current;
    stateRef.current = message;
    setState(message);
    if (previous?.match?.raceId !== message.match?.raceId) lastAttemptRef.current = null;
    if (message.phase === 'preparing' && previous?.phase !== 'preparing') cameraReadySentRef.current = false;
    if (['lobby', 'results'].includes(message.phase)) cameraReadyRef.current = false;
    // Report a camera that was already ready when preparation began.
    if (message.phase === 'preparing' && cameraReadyRef.current && !cameraReadySentRef.current) {
      cameraReadySentRef.current = Boolean(send({ type: 'cameraReady', ready: true }));
    }
    // Success burst when this player's newest attempt is a correct sign.
    const mine = message.match?.snapshot?.players.find(p => p.id === sessionRef.current?.playerId);
    const attempt = mine?.lastAttempt;
    if (attempt && attempt.timestamp !== lastAttemptRef.current?.timestamp) {
      lastAttemptRef.current = attempt;
      if (attempt.correct) {
        const id = `${message.match.raceId}:${attempt.timestamp}`;
        setCelebration({ id, sign: attempt.target, next: mine.currentTarget });
        setTimeout(() => setCelebration(current => current?.id === id ? null : current), SUCCESS_PAUSE_MS);
      }
    }
  }

  function client() {
    if (!clientRef.current) {
      clientRef.current = new LanClient({
        onState: handleState,
        onWelcome: welcome => {
          sessionRef.current = welcome; setSession(welcome); setBusy(''); setError(''); setCanResume(false);
          if (welcome.host && initialSettings) clientRef.current.send({ type: 'settings', ...initialSettings });
        },
        onError: code => { setBusy(''); setError(errorText(code)); },
        onStatus: setConnection,
        onClosed: reason => {
          clientRef.current = null; sessionRef.current = null; stateRef.current = null;
          setSession(null); setState(null); setRecognition(null); setCelebration(null); setBusy('');
          setView('menu'); setCanResume(false);
          setNotice(CLOSED_MESSAGES[reason] ?? '');
        },
      });
    }
    return clientRef.current;
  }

  // Leave the lobby when this screen closes.
  useEffect(() => () => clientRef.current?.leave(), []);

  // Clock for the shared countdown and match timer (server time, not local).
  useEffect(() => {
    if (!['countdown', 'playing', 'paused'].includes(phase)) return undefined;
    const tick = () => setNow(clientRef.current?.serverNow() ?? Date.now());
    const first = setTimeout(tick, 0); // refresh at once: `now` may be stale from an earlier phase
    const timer = setInterval(tick, 200);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [phase]);

  function rememberName() {
    const clean = cleanName(name, '');
    try { if (clean) localStorage.setItem(NAME_KEY, clean); } catch { /* storage unavailable */ }
    return clean;
  }

  async function createLobby() {
    setError(''); setNotice(''); setBusy('Creating lobby…');
    try { await client().create(rememberName()); }
    catch (err) { clientRef.current = null; setBusy(''); setError(errorText(err.message)); }
  }

  async function joinLobby(event) {
    event.preventDefault();
    const code = normalizeInviteCode(codeInput);
    if (!code) { setError('Enter the 6-character invite code.'); return; }
    setError(''); setNotice(''); setBusy(address.trim() ? 'Connecting to the host…' : 'Searching the network for the lobby…');
    try { await client().join(code, rememberName(), address); }
    catch (err) { clientRef.current = null; setBusy(''); setError(errorText(err.message)); }
  }

  async function resumeLobby() {
    setError(''); setBusy('Reconnecting to your lobby…');
    if (!(await client().resume())) { clientRef.current = null; setBusy(''); setCanResume(false); setError(LAN_ERRORS.expired); }
  }

  function leave() {
    clientRef.current?.leave();
    clientRef.current = null; sessionRef.current = null; stateRef.current = null;
    setSession(null); setState(null); setRecognition(null); setCelebration(null); setView('menu');
  }

  function copyCode() {
    navigator.clipboard?.writeText(state.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  }

  function handleRecognition(playerId, result) {
    setRecognition(result);
    if (stateRef.current?.phase !== 'playing' || !result.isNew || result.status !== 'stable' || !result.letter) return;
    // Prefix the event with this page's nonce so a reload never repeats an ID.
    send({ type: 'sign', letter: result.letter, eventId: `${PAGE_NONCE}:${result.eventId}`, challengeId: result.challengeId });
  }

  function handleCameraStatus(playerId, status) {
    cameraReadyRef.current = Boolean(status.ready);
    if (status.error) setError(status.error);
    if (status.ready && stateRef.current?.phase === 'preparing' && !cameraReadySentRef.current) {
      cameraReadySentRef.current = Boolean(send({ type: 'cameraReady', ready: true }));
    }
  }

  const banner = connection === 'reconnecting'
    ? <p className="sd-error lan-banner" role="alert">Connection lost. Attempting to reconnect…</p> : null;

  // ---- Menu, join -------------------------------------------------------
  if (!state) {
    return <section className="sd-setup lan">
      <button className="sd-link" onClick={onExit}>Back to menu</button>
      <h1 className="sd-page-title">LAN multiplayer</h1>
      <p className="sd-hint">Two devices on the same Wi-Fi, each with its own camera. Both devices run the app and the LAN helper (<code>npm run dev:lan</code>).</p>
      {notice && <p className="sd-error" role="alert">{notice}</p>}
      <div className="sd-setup-box glass lan-panel">
        <label className="lan-field">Your name
          <input value={name} maxLength={20} placeholder="Player" onChange={e => setName(e.target.value)} disabled={Boolean(busy)} />
        </label>
        {view === 'menu' ? <div className="lan-actions">
          <button className="sd-button sd-button-start" onClick={createLobby} disabled={Boolean(busy)}>Create lobby</button>
          <button className="sd-button sd-button-secondary" onClick={() => { setView('join'); setError(''); }} disabled={Boolean(busy)}>Join lobby</button>
          {canResume && <button className="sd-button sd-button-secondary" onClick={resumeLobby} disabled={Boolean(busy)}>Rejoin my lobby</button>}
        </div> : <form className="lan-join" onSubmit={joinLobby}>
          <label className="lan-field">Invite code
            <input className="lan-code-input" value={codeInput} maxLength={7} autoFocus autoComplete="off" spellCheck={false}
              placeholder="X7K9P2" onChange={e => setCodeInput(e.target.value.toUpperCase())} disabled={Boolean(busy)} />
          </label>
          <details className="lan-advanced">
            <summary>Can't find the lobby?</summary>
            <label className="lan-field">Host address (shown in the host's lobby)
              <input value={address} placeholder="192.168.1.20" onChange={e => setAddress(e.target.value)} disabled={Boolean(busy)} />
            </label>
          </details>
          <div className="lan-actions">
            <button className="sd-button sd-button-start" type="submit" disabled={Boolean(busy)}>Join</button>
            <button className="sd-button sd-button-secondary" type="button" onClick={() => { setView('menu'); setError(''); }} disabled={Boolean(busy)}>Back</button>
          </div>
        </form>}
        {busy && <p className="lan-busy" role="status"><span className="lan-spinner" aria-hidden="true" />{busy}</p>}
        {error && <p className="sd-error" role="alert">{error}</p>}
      </div>
    </section>;
  }

  // ---- Lobby ------------------------------------------------------------
  if (phase === 'lobby') {
    const isHost = session?.host;
    const bothConnected = state.players.length === 2 && state.players.every(p => p.connected);
    const bothReady = bothConnected && state.players.every(p => p.ready);
    const status = state.players.length < 2 ? 'Waiting for Player 2…'
      : !bothConnected ? 'Waiting for a player to reconnect…'
        : bothReady ? 'Ready to play' : 'Waiting for both players to be ready';
    return <section className="sd-setup lan">
      {banner}
      <h1 className="sd-page-title">LAN multiplayer</h1>
      <div className="sd-setup-box glass lan-panel lan-lobby">
        <p className="lan-label">Lobby code</p>
        <div className="lan-code-row">
          <strong className="lan-code" aria-label={`Lobby code ${state.code.split('').join(' ')}`}>{state.code}</strong>
          <button className="sd-button sd-button-secondary sd-small" onClick={copyCode}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        {isHost && <p className="sd-hint">Share this code with Player 2. If their device can't find the lobby, they can enter this address: <b>{state.lanAddresses.join(' or ') || 'not on a network'}</b></p>}
        <ul className="lan-players">
          {[0, 1].map(slot => {
            const player = state.players[slot];
            if (!player) return <li key={slot} className="lan-player lan-player--empty"><span className="lan-spinner" aria-hidden="true" />Waiting for Player 2…</li>;
            return <li key={player.id} className={`lan-player sd-player--${player.id}`}>
              <span className="sd-tag">P{slot + 1}</span>
              <span className="lan-player__name">{player.name}{player.host ? ' (Host)' : ''}{player.id === session?.playerId ? ' · You' : ''}</span>
              <span className={`lan-pill${player.connected ? ' ok' : ''}`}>{player.connected ? 'Connected ✓' : 'Reconnecting…'}</span>
              <span className={`lan-pill${player.ready ? ' ok' : ''}`}>{player.ready ? 'Ready ✓' : 'Not ready'}</span>
            </li>;
          })}
        </ul>
        <fieldset className="sd-duration-options" disabled={!isHost}>
          <legend>Signs {isHost ? '' : '(host chooses)'}</legend>
          <div>{VOCABULARIES.map(([value, label]) => <button type="button" key={value} aria-pressed={state.settings.vocabulary === value}
            className={`sd-button sd-button-secondary ${state.settings.vocabulary === value ? 'selected' : ''}`}
            onClick={() => send({ type: 'settings', durationSeconds: state.settings.durationSeconds, vocabulary: value })}>{label}</button>)}</div>
        </fieldset>
        <fieldset className="sd-duration-options" disabled={!isHost}>
          <legend>Match length {isHost ? '' : '(host chooses)'}</legend>
          <div>{RACE_DURATIONS.map(seconds => <button type="button" key={seconds} aria-pressed={state.settings.durationSeconds === seconds}
            className={`sd-button sd-button-secondary ${state.settings.durationSeconds === seconds ? 'selected' : ''}`}
            onClick={() => send({ type: 'settings', durationSeconds: seconds, vocabulary: state.settings.vocabulary })}>{seconds}s</button>)}</div>
        </fieldset>
        <p className="lan-status" role="status">Status: <b>{status}</b></p>
        <div className="lan-actions">
          <button className={`sd-button ${lobbyMe?.ready ? 'sd-button-secondary' : ''}`} onClick={() => send({ type: 'ready', ready: !lobbyMe?.ready })}>
            {lobbyMe?.ready ? 'Not ready' : 'Ready'}
          </button>
          {isHost && <button className="sd-button sd-button-start" disabled={!bothReady} onClick={() => send({ type: 'start' })}>Start match</button>}
          <button className="sd-button sd-button-secondary" onClick={leave}>Leave lobby</button>
        </div>
        {!isHost && bothReady && <p className="sd-hint">Waiting for the host to start the match…</p>}
        {error && <p className="sd-error" role="alert">{error}</p>}
      </div>
    </section>;
  }

  // ---- Results ----------------------------------------------------------
  if (phase === 'results' && state.match?.results) {
    const results = state.match.results;
    const mine = results.players.find(p => p.id === session?.playerId);
    const theirs = results.players.find(p => p.id !== session?.playerId);
    const title = results.winnerId === null ? "IT'S A DRAW!" : results.winnerId === session?.playerId ? 'YOU WIN!' : 'MATCH OVER';
    const opponentVoted = lobbyOpponent?.rematch;
    return <ResultsReveal key={state.match.raceId} title={title} subtitle={`${mine?.score ?? 0} – ${theirs?.score ?? 0}`}>
      <div>
        <ResultsScreen durationSeconds={results.durationSeconds} players={results.ranking.map(asResultPlayer)}
          winnerId={results.winnerId} winReason={results.winReason}
          rematchLabel={lobbyMe?.rematch ? 'Waiting for opponent…' : opponentVoted ? 'Play again (opponent is ready)' : 'Play again'}
          onRematch={() => send({ type: 'rematch' })} homeLabel="Leave match" onHome={leave}
          extraActions={<button className="sd-button sd-button-secondary" onClick={() => send({ type: 'toLobby' })}>Return to lobby</button>} />
        {state.players.length < 2 && <p className="sd-hint">Your opponent has left. Return to the lobby to wait for a new player.</p>}
      </div>
    </ResultsReveal>;
  }

  // ---- Game (preparing, countdown, playing, paused) ----------------------
  const match = state.match;
  const duration = state.settings.durationSeconds;
  const remaining = phase === 'playing' && match?.endsAt ? Math.min(duration, Math.max(0, (match.endsAt - now) / 1000))
    : match?.snapshot?.remainingSeconds ?? duration;
  const countdown = phase === 'countdown' && match?.startAt
    ? Math.min(Math.ceil(START_COUNTDOWN_MS / 1000), Math.max(1, Math.ceil((match.startAt - now) / 1000))) : null;
  const status = phase === 'playing' ? 'running' : 'waiting';
  const myPanel = me ?? { id: session?.playerId ?? 'p1', name: lobbyMe?.name ?? 'You', score: 0, correct: 0, mistakes: 0, skipped: 0,
    accuracy: 0, hearts: null, currentTarget: null, challengeId: null, window: { from: 0, signs: [] }, skippedIndices: [], skipsLeft: SKIPS_PER_RACE, lastAttempt: null };
  const seconds = Math.ceil(remaining);
  const waitingText = phase === 'preparing'
    ? (lobbyMe?.cameraReady ? 'Camera ready. Waiting for your opponent’s camera…' : 'Starting your camera…')
    : phase === 'countdown' ? 'Get ready…' : phase === 'paused' ? 'Paused while your opponent reconnects.' : undefined;
  return <section className="sd-race sd-race--versus lan-game">
    {banner}
    <header className="sd-race-header glass">
      <p className="sd-mode-tag">LAN match<span>{duration}s round · Code {state.code}</span></p>
      <h2 className={`sd-clock${phase === 'playing' && seconds <= 10 ? ' sd-clock--low' : ''}`}><b>{seconds}</b>
        <span>{phase === 'playing' ? 's remaining' : phase === 'paused' ? 'Paused' : 'Starting'}</span></h2>
      <button className="sd-button sd-button-secondary sd-small" onClick={leave}>Leave match</button>
    </header>
    <div className="lan-scoreboard glass" aria-live="polite">
      <span className={`sd-player--${myPanel.id}`}>You <b>{(me?.score ?? 0).toLocaleString()}</b></span>
      <span className="lan-scoreboard__vs">vs</span>
      <span className={`sd-player--${opponent?.id ?? 'p2'}`}>{opponent?.name ?? lobbyOpponent?.name ?? 'Opponent'} <b>{(opponent?.score ?? 0).toLocaleString()}</b></span>
    </div>
    <div className="sd-race-grid glass lan-grid">
      <RacePlayer player={myPanel} index={myPanel.id === 'p1' ? 0 : 1} status={status} timeLeft={remaining / duration}
        cameraId={cameraId} recognition={recognition} event={waitingText} celebration={celebration}
        onRecognition={handleRecognition} onCameraStatus={handleCameraStatus}
        onSimulate={(id, letter) => send({ type: 'sign', letter, eventId: `${PAGE_NONCE}:sim:${now}`, challengeId: me?.challengeId ?? '' })}
        onSkip={(id, challengeId) => send({ type: 'skip', challengeId })} />
      {opponent && <RacePlayer remote player={opponent} index={opponent.id === 'p1' ? 0 : 1} status={status} timeLeft={remaining / duration}
        remoteNote={lobbyOpponent?.connected === false ? 'Opponent disconnected.' : 'Signing on their own device'} />}
    </div>
    {countdown && <div className="lan-countdown" role="status" aria-live="assertive"><span key={countdown}>{countdown}</span></div>}
    {phase === 'paused' && <div className="lan-pause" role="alert">
      <PixelSprite name="heart" scale={4} />
      <strong>Opponent disconnected.</strong>
      <span>Waiting for them to reconnect{state.pause?.until ? ` (${Math.max(0, Math.ceil((state.pause.until - now) / 1000))}s)` : ''}. The clock is paused.</span>
    </div>}
    {error && <p className="sd-error" role="alert">{error}</p>}
  </section>;
}
