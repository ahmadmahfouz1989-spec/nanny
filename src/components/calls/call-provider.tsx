"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { canOptimize } from "@/lib/image-src";
import { useTranslations } from "next-intl";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getJson, request } from "@/lib/request";
import { haptic, nativeCalls } from "@/lib/native-app";
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
const DISCONNECTED_GRACE_MS = 10_000;
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
  | "error";
type ServerAction = "accept" | "decline" | "busy" | "end" | "failed";
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
};

type View = { phase: Phase; counterpart: Counterpart; reason?: EndReason; activeSince?: number };

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
      setView((v) => (v ? { ...v, phase: "ended", reason, activeSince: undefined } : v));
      if (idleTimer.current) clearTimeout(idleTimer.current);
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
            if (session.role !== "callee" || !pc || session.gotOffer) return;
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
            const status = (next as { status: string }).status;
            if (session.closed) return;
            if (status === "active") {
              // Answered on another of the callee's devices: this one stops ringing.
              if (session.role === "callee" && !session.accepted) return finish(session, "ended");
              if (session.role === "caller") markAnswered(session);
              return;
            }
            const reason: Record<string, EndReason> = {
              declined: "declined",
              busy: "busy",
              missed: session.role === "caller" ? "no_answer" : "missed",
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
      pc.onconnectionstatechange = () => {
        if (session.closed) return;
        const state = pc.connectionState;
        if (state === "connected") {
          session.accepted = true;
          if (graceTimer) clearTimeout(graceTimer);
          graceTimer = null;
          session.stopTone?.();
          session.stopTone = null;
          haptic("success");
          if (session.id) nativeCalls()?.callActive({ callId: session.id, name: session.name }).catch(() => {});
          setView((v) => (v && v.phase !== "active" ? { ...v, phase: "active", activeSince: Date.now() } : v));
        } else if (state === "failed") {
          finish(session, "failed", "failed");
        } else if (state === "disconnected" && !graceTimer) {
          // Often a moment's signal loss: give it a chance to come back.
          graceTimer = setTimeout(() => {
            if (pc.connectionState !== "connected") finish(session, "failed", "failed");
          }, DISCONNECTED_GRACE_MS);
          session.timers.push(graceTimer);
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
      setView({ phase: "starting", counterpart });

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
        code?: string;
      } | null;
      if (!res?.ok || !body?.call) {
        const known: Record<string, EndReason> = { no_conversation: "no_conversation", blocked: "blocked", too_many: "too_many" };
        return finish(session, known[body?.code ?? ""] ?? "error");
      }
      session.id = body.call.id;
      // Hung up while it was being placed.
      if (session.closed) return void tellServer(session.id, "end");
      if (body.counterpart?.name) setView((v) => (v ? { ...v, counterpart: { ...v.counterpart, ...body.counterpart } } : v));

      makePeer(session, body.iceServers ?? []);
      await listen(session);
      if (session.closed) return;
      setView((v) => (v && v.phase === "starting" ? { ...v, phase: "outgoing" } : v));
      session.stopTone = playTone("ringback");
      later(session, RING_SECONDS * 1000, () => {
        if (!session.accepted) finish(session, "no_answer", "end");
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
      setView({ phase: answered ? "connecting" : "incoming", counterpart: counterpart ?? { name: "", photoUrl: null } });
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
      {view && (
        <CallScreen
          view={view}
          elapsed={elapsed}
          muted={muted}
          onAccept={accept}
          onDecline={decline}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onClose={() => setView(null)}
        />
      )}
    </CallContext.Provider>
  );
}

// -- screen -------------------------------------------------------------------

function CallScreen({
  view,
  elapsed,
  muted,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onClose,
}: {
  view: View;
  elapsed: number;
  muted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Calls");
  const { phase, counterpart, reason } = view;
  const name = counterpart.name || t("someone");

  const status =
    phase === "starting" || phase === "outgoing"
      ? t("calling")
      : phase === "incoming"
        ? t("incoming")
        : phase === "connecting"
          ? t("connecting")
          : phase === "active"
            ? formatDuration(elapsed)
            : t(`reason.${reason ?? "ended"}`);

  const roundButton = "flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition active:scale-90";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("screenLabel", { name })}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-surface px-6 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] text-ink"
    >
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
