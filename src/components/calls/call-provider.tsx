"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { canOptimize } from "@/lib/image-src";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getJson, request } from "@/lib/request";
import { useRouter } from "@/i18n/navigation";
import { announceUnreadChanged } from "@/lib/unread-events";
import { haptic, nativeCalls, type MissedCallOpen } from "@/lib/native-app";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { MicIcon } from "@/components/nav-icons";
import { PhoneIcon } from "@/components/calls/phone-icon";

/**
 * In-app voice calls. The audio goes straight between the two phones
 * (WebRTC); they find each other through a Supabase Realtime broadcast
 * channel per call ("call:<id>"), and the call's row in `calls` (written by
 * /api/calls) says when it's answered, declined or over.
 *
 *   caller: mic → POST /api/calls (rings the callee: realtime + push)
 *           → waits for the callee's "ready" → sends the offer
 *   callee: sees the row arrive (or finds it on opening the app from the
 *           push) → Accept → mic → POST accept → "ready" → answers the offer
 *
 * Mounted once in the locale layout, so a call survives moving between
 * pages; the call screen covers everything while a call is on.
 */

const RING_SECONDS = 45; // as in src/lib/calls.ts
const CONNECT_TIMEOUT_MS = 25_000;
// A dropped connection (walking out of Wi-Fi, a tunnel) gets this long to
// come back, with the caller asking for a new route every few seconds.
const DISCONNECTED_GRACE_MS = 20_000;
const RECONNECT_EVERY_MS = 4000;
// No sign of their app ringing by then (and no phone of theirs that rings
// on its own): say they're not in the app, while it keeps ringing.
const NOT_IN_APP_AFTER_MS = 12_000;
const QUALITY_CHECK_MS = 3000;
const READY_RESEND_MS = 1500;
const ENDED_SCREEN_MS = 2500;

type Counterpart = { name: string; photoUrl: string | null };
type Phase = "starting" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
type EndReason =
  | "ended"
  | "declined"
  | "busy"
  | "no_answer"
  | "missed"
  | "failed"
  | "no_conversation"
  | "blocked"
  | "too_many"
  | "mic_denied"
  | "unsupported"
  | "calls_off"
  | "not_in_app"
  | "error";
type ServerAction = "accept" | "decline" | "busy" | "end" | "failed" | "reached";
type Signal =
  | { kind: "ready" }
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "hangup" };

type Session = {
  id: string | null;
  /** Who's on the other end, for the phone's own call screens. */
  name: string;
  matchId: string;
  role: "caller" | "callee";
  createdAt: number;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  channels: RealtimeChannel[];
  signal: RealtimeChannel | null;
  pendingIce: RTCIceCandidateInit[];
  offered: boolean;
  gotOffer: boolean;
  accepted: boolean;
  timers: ReturnType<typeof setTimeout>[];
  stopTone: (() => void) | null;
  closed: boolean;
  /** The callee's app said it's ringing. */
  reached: boolean;
  /** The callee has a phone that rings on its own (no "not in the app" hint). */
  phoneRings: boolean;
};

type View = {
  phase: Phase;
  counterpart: Counterpart;
  matchId: string;
  role: "caller" | "callee";
  reason?: EndReason;
  activeSince?: number;
  /** "Ringing…" instead of "Calling…". */
  reached?: boolean;
  notInApp?: boolean;
  reconnecting?: boolean;
  poorConnection?: boolean;
  /** Shrunk to a bar so the app can be used during the call. */
  minimized?: boolean;
};

/** Reasons after which the end screen stays up with Call again / Message. */
const FOLLOW_UP_REASONS: EndReason[] = ["no_answer", "not_in_app", "declined", "busy", "failed", "calls_off", "missed"];

type CallContextValue = {
  startCall: (matchId: string, counterpart: Counterpart) => void;
  inCall: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

/** Null outside the provider (e.g. the admin pages): no call buttons there. */
export function useCall() {
  return useContext(CallContext);
}

// -- tones --------------------------------------------------------------------

/**
 * The ring (incoming) and ringback (outgoing) sounds, made with Web Audio
 * so there's no file to load. The browser may keep audio silent until a
 * tap -- an incoming ring before any tap still vibrates.
 */
function playTone(kind: "ring" | "ringback"): () => void {
  let ctx: AudioContext | null = null;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctx ? new Ctx() : null;
    ctx?.resume().catch(() => {});
  } catch {
    ctx = null;
  }

  function beep(freqs: number[], start: number, length: number, volume: number) {
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.setValueAtTime(volume, start + length - 0.05);
    gain.gain.linearRampToValueAtTime(0, start + length);
    gain.connect(ctx.destination);
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + length);
    }
  }

  function cycle() {
    if (kind === "ring") {
      if (ctx) {
        const t = ctx.currentTime;
        beep([880], t, 0.25, 0.18);
        beep([660], t + 0.3, 0.25, 0.18);
        beep([880], t + 0.6, 0.25, 0.18);
      }
      try {
        navigator.vibrate?.([400, 200, 400]);
      } catch {}
      haptic("medium");
    } else if (ctx) {
      beep([440, 480], ctx.currentTime, 1.5, 0.08);
    }
  }

  cycle();
  const interval = setInterval(cycle, kind === "ring" ? 2500 : 4000);
  return () => {
    clearInterval(interval);
    try {
      navigator.vibrate?.(0);
    } catch {}
    ctx?.close().catch(() => {});
  };
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function later(session: Session, ms: number, fn: () => void) {
  session.timers.push(setTimeout(() => !session.closed && fn(), ms));
}

function newSession(role: Session["role"], matchId: string, id: string | null, createdAt = Date.now()): Session {
  return {
    id,
    name: "",
    matchId,
    role,
    createdAt,
    pc: null,
    stream: null,
    channels: [],
    signal: null,
    pendingIce: [],
    offered: false,
    gotOffer: false,
    accepted: false,
    timers: [],
    stopTone: null,
    closed: false,
    reached: false,
    phoneRings: false,
  };
}

async function flushIce(session: Session) {
  const pc = session.pc;
  if (!pc?.remoteDescription) return;
  const queued = session.pendingIce.splice(0);
  for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
}

async function getMic(): Promise<MediaStream | EndReason> {
  if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return "mic_denied";
  }
}

// -- provider -----------------------------------------------------------------

export function CallProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [muted, setMuted] = useState(false);
  // Loudspeaker on/off; null where the phone can't switch it (browsers, apps before 1.6).
  const [speaker, setSpeaker] = useState<boolean | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const tellServer = useCallback((id: string | null, action: ServerAction) => {
    if (!id) return Promise.resolve(null);
    return request(`/api/calls/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }, []);

  const send = useCallback((session: Session, payload: Signal) => {
    session.signal?.send({ type: "broadcast", event: "signal", payload }).catch(() => {});
  }, []);

  /** Tears the call down and shows why it ended for a moment. */
  const finish = useCallback(
    (session: Session, reason: EndReason, action?: ServerAction) => {
      if (session.closed) return;
      session.closed = true;
      if (action) {
        if (action === "end" || action === "failed" || action === "decline") send(session, { kind: "hangup" });
        void tellServer(session.id, action);
      }
      session.stopTone?.();
      session.timers.forEach(clearTimeout);
      session.stream?.getTracks().forEach((t) => t.stop());
      session.pc?.close();
      for (const ch of session.channels) supabase.removeChannel(ch);
      if (audioRef.current) audioRef.current.srcObject = null;
      if (sessionRef.current === session) sessionRef.current = null;
      // The phone's own ringing, call screen and ongoing-call notification go too.
      if (session.id) nativeCalls()?.callEnded({ callId: session.id }).catch(() => {});
      setMuted(false);
      setSpeaker(null);
      setView((v) =>
        v
          ? { ...v, phase: "ended", reason, activeSince: undefined, minimized: false, reconnecting: false, poorConnection: false, notInApp: false }
          : v,
      );
      if (reason === "missed") announceUnreadChanged();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      // A call that didn't happen stays up with Call again / Message; one
      // that just ended goes by itself.
      const followUp = !session.accepted && (session.role === "caller" ? FOLLOW_UP_REASONS.includes(reason) : reason === "missed");
      if (followUp) return;
      idleTimer.current = setTimeout(() => {
        if (!sessionRef.current) setView(null);
      }, ENDED_SCREEN_MS);
    },
    [send, supabase, tellServer],
  );

  /** The caller learns the call was answered: stop the ringback, give it time to connect. */
  const markAnswered = useCallback(
    (session: Session) => {
      if (session.role !== "caller" || session.accepted) return;
      session.accepted = true;
      session.stopTone?.();
      session.stopTone = null;
      later(session, CONNECT_TIMEOUT_MS, () => {
        if (session.pc?.connectionState !== "connected") finish(session, "failed", "failed");
      });
      setView((v) => (v && (v.phase === "outgoing" || v.phase === "starting") ? { ...v, phase: "connecting" } : v));
    },
    [finish],
  );

  const handleSignal = useCallback(
    async (session: Session, msg: Signal) => {
      if (session.closed) return;
      const pc = session.pc;
      try {
        switch (msg.kind) {
          case "ready":
            if (session.role !== "caller" || !pc) return;
            // Only sent once they've answered -- even if the row's update hasn't reached us.
            markAnswered(session);
            if (!session.offered) {
              session.offered = true;
              await pc.setLocalDescription(await pc.createOffer());
            }
            // Sent again on every "ready": the callee repeats it until an offer gets through.
            if (pc.localDescription) send(session, { kind: "offer", sdp: pc.localDescription.toJSON() });
            break;
          case "offer":
            if (session.role !== "callee" || !pc) return;
            // A second offer is the caller finding a new route after the
            // connection dropped (ICE restart): answer it the same way.
            if (session.gotOffer && pc.signalingState !== "stable") return;
            session.gotOffer = true;
            await pc.setRemoteDescription(msg.sdp);
            await flushIce(session);
            await pc.setLocalDescription(await pc.createAnswer());
            if (pc.localDescription) send(session, { kind: "answer", sdp: pc.localDescription.toJSON() });
            break;
          case "answer":
            if (session.role !== "caller" || !pc || pc.signalingState !== "have-local-offer") return;
            await pc.setRemoteDescription(msg.sdp);
            await flushIce(session);
            break;
          case "ice":
            if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
            else session.pendingIce.push(msg.candidate);
            break;
          case "hangup":
            finish(session, session.accepted ? "ended" : session.role === "caller" ? "declined" : "missed");
            break;
        }
      } catch (err) {
        console.error("[call] signal", msg.kind, err);
        finish(session, "failed", "failed");
      }
    },
    [finish, markAnswered, send],
  );

  /** The call's broadcast channel and its row: resolves once listening. */
  const listen = useCallback(
    (session: Session) =>
      new Promise<void>((resolve) => {
        const id = session.id!;
        const signal = supabase
          .channel(`call:${id}`, { config: { broadcast: { self: false } } })
          .on("broadcast", { event: "signal" }, ({ payload }) => void handleSignal(session, payload as Signal))
          .subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
          });
        const row = supabase
          .channel(`call-row:${id}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${id}` }, ({ new: next }) => {
            const { status, reached_at } = next as { status: string; reached_at: string | null };
            if (session.closed) return;
            if (status === "ringing" && reached_at && session.role === "caller" && !session.reached) {
              session.reached = true;
              setView((v) => (v && v.phase === "outgoing" ? { ...v, reached: true, notInApp: false } : v));
              return;
            }
            if (status === "active") {
              // Answered on another of the callee's devices: this one stops ringing.
              if (session.role === "callee" && !session.accepted) return finish(session, "ended");
              if (session.role === "caller") markAnswered(session);
              return;
            }
            const reason: Record<string, EndReason> = {
              declined: "declined",
              busy: "busy",
              missed: session.role === "caller" ? (session.reached || session.phoneRings ? "no_answer" : "not_in_app") : "missed",
              ended: "ended",
              failed: "failed",
            };
            if (reason[status]) finish(session, reason[status]);
          })
          .subscribe();
        session.signal = signal;
        session.channels.push(signal, row);
        // Don't wait forever on a channel that never opens.
        later(session, 8000, resolve);
      }),
    [finish, handleSignal, markAnswered, supabase],
  );

  const makePeer = useCallback(
    (session: Session, iceServers: RTCIceServer[]) => {
      const pc = new RTCPeerConnection({ iceServers });
      session.pc = pc;
      session.stream?.getTracks().forEach((track) => pc.addTrack(track, session.stream!));
      pc.onicecandidate = (e) => {
        if (e.candidate) send(session, { kind: "ice", candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        audio.play().catch(() => {});
      };
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      let restartTimer: ReturnType<typeof setInterval> | null = null;
      let qualityTimer: ReturnType<typeof setInterval> | null = null;
      // The caller asks for a fresh route (ICE restart); the callee answers
      // the new offer in handleSignal.
      const restart = async () => {
        if (session.closed || session.role !== "caller") return;
        try {
          // The last attempt's answer never came back: start that one over.
          if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
          if (pc.localDescription) send(session, { kind: "offer", sdp: pc.localDescription.toJSON() });
        } catch (err) {
          console.error("[call] ice restart", err);
        }
      };
      const stopReconnecting = () => {
        if (graceTimer) clearTimeout(graceTimer);
        if (restartTimer) clearInterval(restartTimer);
        graceTimer = null;
        restartTimer = null;
      };
      const startReconnecting = () => {
        setView((v) => (v && v.phase === "active" ? { ...v, reconnecting: true } : v));
        if (graceTimer) return;
        graceTimer = setTimeout(() => {
          stopReconnecting();
          if (pc.connectionState !== "connected") finish(session, "failed", "failed");
        }, DISCONNECTED_GRACE_MS);
        session.timers.push(graceTimer);
        void restart();
        restartTimer = setInterval(() => void restart(), RECONNECT_EVERY_MS);
        session.timers.push(restartTimer as unknown as ReturnType<typeof setTimeout>);
      };
      // Round trip and lost audio, every few seconds: "Poor connection".
      let lastLost = 0;
      let lastReceived = 0;
      const checkQuality = async () => {
        if (session.closed || pc.connectionState !== "connected") return;
        try {
          const stats = await pc.getStats();
          let rtt = 0;
          let lost = 0;
          let received = 0;
          stats.forEach((r) => {
            if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded") rtt = r.currentRoundTripTime ?? 0;
            if (r.type === "inbound-rtp" && r.kind === "audio") {
              lost = r.packetsLost ?? 0;
              received = r.packetsReceived ?? 0;
            }
          });
          const dl = lost - lastLost;
          const dr = received - lastReceived;
          lastLost = lost;
          lastReceived = received;
          const lossRatio = dl + dr > 0 ? dl / (dl + dr) : 0;
          const poor = rtt > 0.6 || lossRatio > 0.1;
          setView((v) => (v && v.phase === "active" && !!v.poorConnection !== poor ? { ...v, poorConnection: poor } : v));
        } catch {}
      };
      pc.onconnectionstatechange = () => {
        if (session.closed) {
          if (qualityTimer) clearInterval(qualityTimer);
          return;
        }
        const state = pc.connectionState;
        if (state === "connected") {
          session.accepted = true;
          stopReconnecting();
          setView((v) => (v?.reconnecting ? { ...v, reconnecting: false } : v));
          if (!qualityTimer) {
            qualityTimer = setInterval(() => void checkQuality(), QUALITY_CHECK_MS);
            session.timers.push(qualityTimer as unknown as ReturnType<typeof setTimeout>);
          }
          session.stopTone?.();
          session.stopTone = null;
          haptic("success");
          if (session.id) nativeCalls()?.callActive({ callId: session.id, name: session.name }).catch(() => {});
          // Where the sound comes out now (the phone picks the speaker or the earpiece first).
          nativeCalls()
            ?.speaker?.()
            .then((r) => !session.closed && setSpeaker(r.on))
            .catch(() => {});
          setView((v) => (v && v.phase !== "active" ? { ...v, phase: "active", activeSince: Date.now() } : v));
        } else if (state === "failed" || state === "disconnected") {
          // Never connected: nothing to come back to.
          if (!session.accepted || !pc.remoteDescription) {
            if (state === "failed") finish(session, "failed", "failed");
            return;
          }
          // Often a moment's signal loss: try to come back first.
          startReconnecting();
        }
      };
      return pc;
    },
    [finish, send],
  );

  // -- outgoing --

  const startCall = useCallback(
    async (matchId: string, counterpart: Counterpart) => {
      if (sessionRef.current) return;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      const session = newSession("caller", matchId, null);
      session.name = counterpart.name;
      sessionRef.current = session;
      setMuted(false);
      setView({ phase: "starting", counterpart, matchId, role: "caller" });

      const mic = await getMic();
      if (typeof mic === "string") return finish(session, mic);
      session.stream = mic;
      if (session.closed) return mic.getTracks().forEach((t) => t.stop());

      const res = await request("/api/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const body = (await res?.json().catch(() => null)) as {
        call?: { id: string };
        counterpart?: Counterpart;
        iceServers?: RTCIceServer[];
        phoneRings?: boolean;
        code?: string;
      } | null;
      if (!res?.ok || !body?.call) {
        const known: Record<string, EndReason> = {
          no_conversation: "no_conversation",
          blocked: "blocked",
          too_many: "too_many",
          calls_off: "calls_off",
        };
        return finish(session, known[body?.code ?? ""] ?? "error");
      }
      session.id = body.call.id;
      session.phoneRings = !!body.phoneRings;
      // Hung up while it was being placed.
      if (session.closed) return void tellServer(session.id, "end");
      if (body.counterpart?.name) setView((v) => (v ? { ...v, counterpart: { ...v.counterpart, ...body.counterpart } } : v));

      makePeer(session, body.iceServers ?? []);
      await listen(session);
      if (session.closed) return;
      setView((v) => (v && v.phase === "starting" ? { ...v, phase: "outgoing" } : v));
      session.stopTone = playTone("ringback");
      later(session, NOT_IN_APP_AFTER_MS, () => {
        if (!session.reached && !session.phoneRings && !session.accepted) setView((v) => (v && v.phase === "outgoing" ? { ...v, notInApp: true } : v));
      });
      later(session, RING_SECONDS * 1000, () => {
        if (!session.accepted) finish(session, session.reached || session.phoneRings ? "no_answer" : "not_in_app", "end");
      });
    },
    [finish, listen, makePeer, tellServer],
  );

  // -- incoming --

  // ringIn starts the answer itself when the phone's call screen was used to answer.
  const acceptRef = useRef<() => Promise<void>>(async () => {});

  const ringIn = useCallback(
    async (call: { id: string; matchId: string; createdAt: string }, counterpart?: Counterpart, answered = false) => {
      const current = sessionRef.current;
      if (current?.id === call.id) return;
      if (current) {
        void tellServer(call.id, "busy");
        return;
      }
      const createdAt = Date.parse(call.createdAt) || Date.now();
      const left = RING_SECONDS * 1000 - (Date.now() - createdAt);
      // Clocks differ between phone and server: never ring for less than a few seconds.
      const ringFor = Math.min(RING_SECONDS * 1000, Math.max(5000, left));

      const session = newSession("callee", call.matchId, call.id, createdAt);
      sessionRef.current = session;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setMuted(false);
      session.name = counterpart?.name ?? "";
      setView({ phase: answered ? "connecting" : "incoming", counterpart: counterpart ?? { name: "", photoUrl: null }, matchId: call.matchId, role: "callee" });
      // The caller's screen moves on to "Ringing…".
      if (!answered) void tellServer(call.id, "reached");
      // In the apps the phone rings itself (CallKit, Android's call notification).
      if (!nativeCalls() && !answered) session.stopTone = playTone("ring");
      later(session, ringFor, () => !session.accepted && finish(session, "missed"));
      const listening = listen(session);
      if (answered) {
        await listening;
        await acceptRef.current();
      }
      if (!counterpart) {
        const info = await getJson<{ counterpart?: Counterpart; call?: { status: string } }>(`/api/calls/${call.id}`);
        if (info?.call && info.call.status !== "ringing") return finish(session, "missed");
        if (info?.counterpart) {
          session.name = info.counterpart.name;
          setView((v) => (v && sessionRef.current === session ? { ...v, counterpart: info.counterpart! } : v));
        }
      }
    },
    [finish, listen, tellServer],
  );

  /** Answers the ringing call: the microphone, the server, then waiting for the caller's offer. */
  const acceptNow = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.role !== "callee" || session.accepted) return;
    session.accepted = true;
    session.stopTone?.();
    session.stopTone = null;
    setView((v) => (v ? { ...v, phase: "connecting" } : v));

    const mic = await getMic();
    if (typeof mic === "string") return finish(session, mic, "decline");
    session.stream = mic;
    if (session.closed) return mic.getTracks().forEach((t) => t.stop());

    const res = await tellServer(session.id, "accept");
    const body = (await res?.json().catch(() => null)) as { iceServers?: RTCIceServer[] } | null;
    if (!res?.ok) return finish(session, res?.status === 409 ? "missed" : "error");
    makePeer(session, body?.iceServers ?? []);

    // Tell the caller we're listening, until their offer arrives.
    let tries = 0;
    const sayReady = () => {
      if (session.closed || session.gotOffer || tries++ > 10) return;
      send(session, { kind: "ready" });
      later(session, READY_RESEND_MS, sayReady);
    };
    sayReady();
    later(session, CONNECT_TIMEOUT_MS, () => {
      if (session.pc?.connectionState !== "connected") finish(session, "failed", "failed");
    });
  }, [finish, makePeer, send, tellServer]);

  useEffect(() => {
    acceptRef.current = acceptNow;
  }, [acceptNow]);

  /**
   * Accept on the call screen. On iPhone it goes through CallKit, so the
   * call is a phone call to iOS (keeps running with the screen locked);
   * CallKit's "answered" event then starts it here.
   */
  const accept = useCallback(async () => {
    const session = sessionRef.current;
    const calls = nativeCalls();
    if (session?.id && calls) {
      const { handled } = await calls.answer({ callId: session.id }).catch(() => ({ handled: false }));
      if (handled) {
        session.stopTone?.();
        setView((v) => (v ? { ...v, phase: "connecting" } : v));
        return;
      }
    }
    await acceptNow();
  }, [acceptNow]);

  const decline = useCallback(() => {
    const session = sessionRef.current;
    if (session) finish(session, "declined", "decline");
  }, [finish]);

  const hangUp = useCallback(() => {
    const session = sessionRef.current;
    if (session) finish(session, "ended", session.id ? "end" : undefined);
    else setView(null);
  }, [finish]);

  // A call ringing for me: as it's created (realtime), and whenever the
  // app comes to the front (opened from the push, or the event was missed).
  useEffect(() => {
    if (!userId) return;
    const check = () => {
      if (document.visibilityState !== "visible" || sessionRef.current) return;
      getJson<{ call: { id: string; matchId: string; createdAt: string } | null; counterpart?: Counterpart }>("/api/calls").then((body) => {
        if (body?.call) void ringIn(body.call, body.counterpart);
      });
    };
    check();
    const channel = supabase
      .channel(`calls-in:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` }, ({ new: row }) => {
        const r = row as { id: string; match_id: string; created_at: string; status: string };
        if (r.status === "ringing") void ringIn({ id: r.id, matchId: r.match_id, createdAt: r.created_at });
      })
      .subscribe();
    document.addEventListener("visibilitychange", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, ringIn]);

  // The phone's own call screens: answered or hung up there, and a call the
  // app was opened for before this page was listening.
  useEffect(() => {
    const calls = nativeCalls();
    if (!userId || !calls) return;
    const byId = async (callId: string, answered: boolean) => {
      if (sessionRef.current?.id === callId) {
        if (answered) await acceptRef.current();
        return;
      }
      const info = await getJson<{ call?: { id: string; matchId: string; createdAt: string; status: string }; counterpart?: Counterpart }>(
        `/api/calls/${callId}`,
      );
      if (info?.call?.status === "ringing") await ringIn(info.call, info.counterpart, answered);
      else calls.callEnded({ callId }).catch(() => {});
    };
    calls
      .takePending()
      .then(({ callId, action }) => (callId ? byId(callId, action === "answer") : undefined))
      .catch(() => {});
    const subs = [
      calls.addListener("callAnswered", ({ callId }) => void byId(callId, true)),
      calls.addListener("callEnded", ({ callId }) => {
        const session = sessionRef.current;
        if (session?.id !== callId) return;
        finish(session, session.accepted || session.role === "caller" ? "ended" : "declined", session.accepted || session.role === "caller" ? "end" : "decline");
      }),
    ];
    return () => subs.forEach((l) => void Promise.resolve(l).then((h) => h.remove()).catch(() => {}));
  }, [userId, ringIn, finish]);

  // Closing the page or the app mid-call hangs up properly.
  useEffect(() => {
    const onHide = () => {
      const session = sessionRef.current;
      if (!session?.id || session.closed) return;
      if (session.role === "callee" && !session.accepted) return;
      try {
        navigator.sendBeacon(`/api/calls/${session.id}`, JSON.stringify({ action: "end" }));
      } catch {}
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // The call timer.
  const activeSince = view?.phase === "active" ? view.activeSince : undefined;
  useEffect(() => {
    if (!activeSince) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - activeSince) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeSince]);

  const router = useRouter();
  const minimize = useCallback((minimized: boolean) => setView((v) => (v && v.phase !== "incoming" && v.phase !== "ended" ? { ...v, minimized } : v)), []);
  const callAgain = useCallback(() => {
    if (!view || sessionRef.current) return;
    const { matchId, counterpart } = view;
    void startCall(matchId, counterpart);
  }, [view, startCall]);
  const openChat = useCallback(() => {
    if (!view) return;
    const { matchId } = view;
    setView(null);
    router.push(`/messages?match=${matchId}`);
  }, [view, router]);

  const toggleSpeaker = useCallback(() => {
    if (speaker === null) return;
    nativeCalls()
      ?.speaker?.({ on: !speaker })
      .then((r) => setSpeaker(r.on))
      .catch(() => {});
  }, [speaker]);

  // Android's missed-call notification (apps from 1.6): opened, Call back or Message.
  useEffect(() => {
    const calls = nativeCalls();
    if (!userId || !calls?.takeOpen) return;
    const open = ({ action, matchId, name }: MissedCallOpen) => {
      if (action === "callback" && matchId) void startCall(matchId, { name: name ?? "", photoUrl: null });
      else if (action === "message" && matchId) router.push(`/messages?match=${matchId}`);
      else if (action === "calls") router.push("/messages?tab=calls");
    };
    calls
      .takeOpen()
      .then((pending) => pending.action && open(pending))
      .catch(() => {});
    const sub = calls.addListener("open", open);
    return () => void Promise.resolve(sub).then((h) => h.remove()).catch(() => {});
  }, [userId, startCall, router]);

  const toggleMute = useCallback(() => {
    const stream = sessionRef.current?.stream;
    setMuted((m) => {
      stream?.getAudioTracks().forEach((t) => (t.enabled = m));
      return !m;
    });
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({ startCall: (matchId, counterpart) => void startCall(matchId, counterpart), inCall: !!view }),
    [startCall, view],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {view?.minimized ? (
        <CallBar view={view} elapsed={elapsed} onRestore={() => minimize(false)} onHangUp={hangUp} />
      ) : view ? (
        <CallScreen
          view={view}
          elapsed={elapsed}
          muted={muted}
          speaker={speaker}
          onToggleSpeaker={toggleSpeaker}
          onAccept={accept}
          onDecline={decline}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onClose={() => setView(null)}
          onMinimize={() => minimize(true)}
          onCallAgain={callAgain}
          onMessage={openChat}
        />
      ) : null}
    </CallContext.Provider>
  );
}

// -- screen -------------------------------------------------------------------

function CallScreen({
  view,
  elapsed,
  muted,
  speaker,
  onToggleSpeaker,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onClose,
  onMinimize,
  onCallAgain,
  onMessage,
}: {
  view: View;
  elapsed: number;
  muted: boolean;
  speaker: boolean | null;
  onToggleSpeaker: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onCallAgain: () => void;
  onMessage: () => void;
}) {
  const t = useTranslations("Calls");
  const { phase, counterpart, reason } = view;
  const name = counterpart.name || t("someone");

  const status =
    phase === "starting" || (phase === "outgoing" && !view.reached)
      ? t("calling")
      : phase === "outgoing"
        ? t("ringing")
        : phase === "incoming"
          ? t("incoming")
          : phase === "connecting"
            ? t("connecting")
            : phase === "active"
              ? view.reconnecting
                ? t("reconnecting")
                : formatDuration(elapsed)
              : t(`reason.${reason ?? "ended"}`, { name });
  // Under the status: why it may not be getting through, or a weak line.
  const note =
    phase === "outgoing" && view.notInApp
      ? t("notInApp", { name })
      : phase === "active" && view.poorConnection && !view.reconnecting
        ? t("poorConnection")
        : null;
  const canMinimize = phase === "starting" || phase === "outgoing" || phase === "connecting" || phase === "active";
  // After a call that didn't go through: try again, or write instead.
  const followUp = phase === "ended" && !!reason && FOLLOW_UP_REASONS.includes(reason) && (view.role === "caller" || reason === "missed");

  const roundButton = "flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition active:scale-90";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("screenLabel", { name })}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-surface px-6 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] text-ink"
    >
      {canMinimize && (
        <button
          type="button"
          onClick={onMinimize}
          aria-label={t("minimize")}
          title={t("minimize")}
          className="absolute start-4 top-[calc(1rem+env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className={`relative ${phase === "incoming" || phase === "outgoing" ? "animate-pulse" : ""}`}>
          {counterpart.photoUrl ? (
            <Image src={counterpart.photoUrl} alt="" width={112} height={112} unoptimized={!canOptimize(counterpart.photoUrl)} className="h-28 w-28 rounded-full object-cover" />
          ) : (
            <AvatarIllustration name={name} className="h-28 w-28 rounded-full" />
          )}
        </div>
        <h2 dir="auto" className="font-display text-2xl font-semibold">
          {name}
        </h2>
        <p className={`text-base ${phase === "ended" ? "max-w-xs text-muted" : "text-muted tabular-nums"}`} aria-live="polite">
          {status}
        </p>
        {note && <p className="max-w-xs text-sm text-warning">{note}</p>}
      </div>

      {phase === "incoming" ? (
        <div className="flex w-full max-w-xs items-start justify-between">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onDecline} aria-label={t("decline")} className={`${roundButton} bg-danger text-white`}>
              <PhoneIcon className="h-7 w-7 rotate-[135deg]" />
            </button>
            <span className="text-sm text-muted">{t("decline")}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onAccept} aria-label={t("accept")} className={`${roundButton} bg-success text-white animate-bounce`}>
              <PhoneIcon className="h-7 w-7" />
            </button>
            <span className="text-sm text-muted">{t("accept")}</span>
          </div>
        </div>
      ) : phase === "ended" && followUp ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-6">
          <div className="flex w-full items-start justify-around">
            {reason !== "calls_off" && (
              <div className="flex flex-col items-center gap-2">
                <button type="button" onClick={onCallAgain} aria-label={view.role === "caller" ? t("callAgain") : t("callBack")} className={`${roundButton} bg-success text-white`}>
                  <PhoneIcon className="h-7 w-7" />
                </button>
                <span className="text-sm text-muted">{view.role === "caller" ? t("callAgain") : t("callBack")}</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={onMessage} aria-label={t("message")} className={`${roundButton} bg-primary text-on-primary`}>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-sm text-muted">{t("message")}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-border px-6 py-2.5 text-sm font-medium">
            {t("close")}
          </button>
        </div>
      ) : phase === "ended" ? (
        <button type="button" onClick={onClose} className="rounded-full border border-border px-6 py-2.5 text-sm font-medium">
          {t("close")}
        </button>
      ) : (
        <div className="flex w-full max-w-xs items-start justify-around">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              aria-label={muted ? t("unmute") : t("mute")}
              className={`${roundButton} ${muted ? "bg-ink text-surface" : "bg-surface-sunken text-ink"}`}
            >
              <span className="relative">
                <MicIcon className="h-7 w-7" />
                {muted && <span className="absolute left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />}
              </span>
            </button>
            <span className="text-sm text-muted">{muted ? t("unmute") : t("mute")}</span>
          </div>
          {speaker !== null && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggleSpeaker}
                aria-pressed={speaker}
                aria-label={t("speaker")}
                className={`${roundButton} ${speaker ? "bg-ink text-surface" : "bg-surface-sunken text-ink"}`}
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" strokeLinejoin="round" />
                  <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" strokeLinecap="round" />
                </svg>
              </button>
              <span className="text-sm text-muted">{t("speaker")}</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onHangUp} aria-label={t("hangUp")} className={`${roundButton} bg-danger text-white`}>
              <PhoneIcon className="h-7 w-7 rotate-[135deg]" />
            </button>
            <span className="text-sm text-muted">{t("hangUp")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The call, shrunk to a pill at the top, while the app is used. */
function CallBar({ view, elapsed, onRestore, onHangUp }: { view: View; elapsed: number; onRestore: () => void; onHangUp: () => void }) {
  const t = useTranslations("Calls");
  const name = view.counterpart.name || t("someone");
  const status =
    view.phase === "active"
      ? view.reconnecting
        ? t("reconnecting")
        : formatDuration(elapsed)
      : view.phase === "connecting"
        ? t("connecting")
        : view.reached
          ? t("ringing")
          : t("calling");
  return (
    <div
      role="region"
      aria-label={t("screenLabel", { name })}
      className="fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-[100] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-full bg-success py-1 ps-1 pe-1 text-white shadow-lg"
    >
      <button type="button" onClick={onRestore} aria-label={t("returnToCall")} className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm">
        <PhoneIcon className="h-4 w-4 shrink-0" />
        <span dir="auto" className="truncate font-medium">{name}</span>
        <span className="shrink-0 tabular-nums opacity-90">{status}</span>
      </button>
      <button type="button" onClick={onHangUp} aria-label={t("hangUp")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger">
        <PhoneIcon className="h-4 w-4 rotate-[135deg]" />
      </button>
    </div>
  );
}
