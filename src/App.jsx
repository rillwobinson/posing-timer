import React, { useEffect, useMemo, useRef, useState } from "react";
import { POSES as POSE_LIST } from "./poses.js";
import {
  ThemeProvider, createTheme, CssBaseline, useMediaQuery,
  AppBar, Toolbar, Typography, IconButton, Container, Box, Paper,
  Button, Drawer, Divider, Grid, Card, CardContent, CardActions,
  TextField, Select, MenuItem, Switch, FormControlLabel, InputLabel, FormControl,
  BottomNavigation, BottomNavigationAction, Tabs, Tab, Snackbar, Alert,
  Accordion, AccordionSummary, AccordionDetails, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import {
  PlayArrow, Pause, SkipNext, SkipPrevious, Settings as SettingsIcon,
  History as HistoryIcon, PlaylistPlay, Build, FitnessCenter, Close, ExpandMore, Info
} from "@mui/icons-material";

/*  Lil’ Poser Posing Timer — v2.9
    - Pose Info: description, cues, mistakes + thumbnail; info buttons everywhere
    - Add a Pose: custom poses with defaults, voice alias, imageHint; delete customs
    - Top control bar: back, play/pause, skip, reset, stop
    - Adjustable presets: loop reps + rest, global hold/transition
    - Thumbnails (SVG then PNG) in Session & Presets
    - Share preset link (encode/decode via URL)
    - Delete custom playlists
    - Halfway cue (optional), Big digits mode, Keep screen awake
    - Export History to CSV
    - Swipe left/right on Session, dark/compact modes, welcome sheet
*/

// ---------- data merge ----------
/* You can extend poses in poses.js (optional fields):
   description: string
   cues: string[]
   mistakes: string[]
   imageHint: string (e.g., "front_double_biceps")
   voiceAlias: string (phrase to speak)
   defaultTransitionSec: number
   defaultHoldSec: number
*/

// ---------- utils ----------
function speak(text, voice, rate = 1) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function useVoices() {
  const [voices, setVoices] = useState(() => window.speechSynthesis?.getVoices?.() || []);
  useEffect(() => {
    const onVoices = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    onVoices();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
  }, []);
  return voices;
}
function beep(duration = 120, frequency = 880, gain = 0.18) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = frequency; o.start();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    setTimeout(() => { o.stop(); ctx.close(); }, duration + 60);
  } catch {}
}
function vibrate(ms = 40) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
const fmt = (s) => { const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; };
function shuffle(arr) { const a = arr.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

// thumbnails: prefer SVG then fallback PNG
function PoseThumb({ id, size = 48, radius = 8 }) {
  const [src, setSrc] = React.useState(`/poses/${id}.svg`);
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={(e) => {
        if (src.endsWith(".svg")) setSrc(`/poses/${id}.png`);
        else e.currentTarget.style.display = "none";
      }}
      style={{ borderRadius: radius, objectFit: "cover" }}
    />
  );
}

// share helpers
function encodePresetToLink(preset, adjust) {
  const payload = {
    v: 1,
    label: preset.label,
    repeatCount: adjust?.loopRepeatCount !== "" ? Number(adjust.loopRepeatCount) : preset.repeatCount,
    loopRestSec: adjust?.loopRestSec !== "" ? Number(adjust.loopRestSec) : (preset.loopRestSec || 0),
    everyHoldSec: adjust?.everyHoldSec !== "" ? Number(adjust.everyHoldSec) : null,
    everyTransitionSec: adjust?.everyTransitionSec !== "" ? Number(adjust.everyTransitionSec) : null,
    items: preset.items.map(it => ({ poseId: it.poseId, transitionSec: it.transitionSec, holdSec: it.holdSec }))
  };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const url = new URL(window.location.href);
  url.searchParams.set("preset", b64);
  return url.toString();
}
function decodePresetFromLink() {
  const b64 = new URL(window.location.href).searchParams.get("preset");
  if (!b64) return null;
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch { return null; }
}

// wake lock
let wakeLockRef = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLockRef) {
      wakeLockRef = await navigator.wakeLock.request("screen");
      wakeLockRef.addEventListener("release", () => { wakeLockRef = null; });
    }
  } catch {}
}
function releaseWakeLock() { try { if (wakeLockRef) { wakeLockRef.release(); wakeLockRef = null; } } catch {} }

// CSV export
function exportHistoryCSV(history) {
  const header = "date_iso,tension_sec,total_sec,poses\n";
  const lines = history.map(h =>
    `${new Date(h.date).toISOString()},${h.tensionSec},${h.totalSec},${h.poses}`
  ).join("\n");
  const blob = new Blob([header + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lil-poser-history.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// local custom poses storage
const CUSTOM_POSES_KEY = "lp_custom_poses";
function loadCustomPoses() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_POSES_KEY)) || []; } catch { return []; }
}
function saveCustomPoses(arr) { localStorage.setItem(CUSTOM_POSES_KEY, JSON.stringify(arr)); }

// Build run list with loops/rest/overrides and symmetry quarter-turn flag
function buildRunItems(preset, overrides = null) {
  const items = [];
  const pushSym = (it, j) => items.push({ ...it, needsQuarterTurn: j !== 0 });
  const loopCount = Math.max(1, preset.repeatCount || 1);
  const loopRest = Math.max(0, preset.loopRestSec || 0);
  for (let r = 0; r < loopCount; r++) {
    for (let j = 0; j < preset.items.length; j++) {
      const it = { ...preset.items[j] };
      if (overrides?.everyHoldSec !== "") it.holdSec = Math.max(0, Number(overrides.everyHoldSec) || 0);
      if (overrides?.everyTransitionSec !== "") it.transitionSec = Math.max(0, Number(overrides.everyTransitionSec) || 0);
      if (preset.id === "classic_symmetry_loop") pushSym(it, j);
      else items.push(it);
    }
    if (r < loopCount - 1 && loopRest > 0) {
      items.push({ poseId: "__loop_rest__", transitionSec: loopRest, holdSec: 0, isLoopRest: true });
    }
  }
  return items;
}
function assembleFromMaster(master, PRESETS) {
  const blocks = [];
  for (const step of master.sequence) {
    const base = PRESETS[step.presetRef];
    const merged = { ...base, ...(step.override || {}) };
    blocks.push({ ...merged });
  }
  return blocks;
}

// theme
function makeTheme({ dark = false, compact = true }) {
  return createTheme({
    palette: {
      mode: dark ? "dark" : "light",
      primary: { main: dark ? "#e0e0e0" : "#111" },
      background: { default: dark ? "#101214" : "#f6f6f6", paper: dark ? "#15171a" : "#fff" }
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
    },
    components: {
      MuiPaper: { styleOverrides: { root: { border: dark ? "1px solid #2a2d31" : "1px solid #eaeaea" } } },
      MuiButton: { defaultProps: { size: compact ? "small" : "medium" } },
      MuiTextField: { defaultProps: { size: compact ? "small" : "medium" } },
      MuiSelect: { defaultProps: { size: compact ? "small" : "medium" } },
      MuiFormControl: { defaultProps: { size: compact ? "small" : "medium" } },
      MuiTab: { styleOverrides: { root: { minHeight: compact ? 36 : 44 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: compact ? 36 : 44 } } }
    }
  });
}

// ---------- app ----------
export default function App() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [dark, setDark] = useState(() => JSON.parse(localStorage.getItem("lp_dark") || "false"));
  const [compact, setCompact] = useState(() => JSON.parse(localStorage.getItem("lp_compact") || "true"));
  useEffect(() => localStorage.setItem("lp_dark", JSON.stringify(dark)), [dark]);
  useEffect(() => localStorage.setItem("lp_compact", JSON.stringify(compact)), [compact]);
  const theme = useMemo(() => makeTheme({ dark, compact }), [dark, compact]);

  // first run instructions
  const [showIntro, setShowIntro] = useState(() => {
    const flag = localStorage.getItem("lp_showIntro");
    if (flag === null) { localStorage.setItem("lp_showIntro", "true"); return true; }
    return flag === "true";
  });

  // voices
  const voices = useVoices();
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [voiceRate, setVoiceRate] = useState(1);

  // nav
  const [tab, setTab] = useState(0); // Session | Presets | Build | History
  const [settingsOpen, setSettingsOpen] = useState(false);

  // settings
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bt_settings")) || {
        includeTurningCues: true,
        voiceEnabled: true,
        beepOnTransition: true,
        randomizeFavourites: false,
        roundHoldTargetSec: 0,
        keepAwake: false,
        halfwayCue: false,
        bigDigits: false
      };
    } catch {
      return {
        includeTurningCues: true,
        voiceEnabled: true,
        beepOnTransition: true,
        randomizeFavourites: false,
        roundHoldTargetSec: 0,
        keepAwake: false,
        halfwayCue: false,
        bigDigits: false
      };
    }
  });
  useEffect(() => localStorage.setItem("bt_settings", JSON.stringify(settings)), [settings]);

  // playlists + history
  const [playlists, setPlaylists] = useState(() => { try { return JSON.parse(localStorage.getItem("bt_playlists")) || []; } catch { return []; } });
  useEffect(() => localStorage.setItem("bt_playlists", JSON.stringify(playlists)), [playlists]);
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("bt_history")) || []; } catch { return []; } });
  useEffect(() => localStorage.setItem("bt_history", JSON.stringify(history)), [history]);

  // custom poses
  const [customPoses, setCustomPoses] = useState(loadCustomPoses());
  useEffect(() => saveCustomPoses(customPoses), [customPoses]);

  // merged pose map (built-ins + customs)
  const POSE_MAP = useMemo(() => {
    const builtIns = Object.fromEntries(POSE_LIST.map(p => [p.id, p]));
    const customs = Object.fromEntries(customPoses.map(p => [p.id, p]));
    return { ...builtIns, ...customs };
  }, [customPoses]);

  // presets (can use pose ids from either built-ins or custom)
  const PRESETS = useMemo(() => ({
    classic_symmetry_loop: {
      id: "classic_symmetry_loop",
      label: "Classic Symmetry Loop",
      loopMode: "repeat",
      repeatCount: 2,
      loopRestSec: 0,
      items: [
        { poseId: "front_relaxed", transitionSec: 5, holdSec: 20 },
        { poseId: "side_relaxed",  transitionSec: 5, holdSec: 20 },
        { poseId: "back_relaxed",  transitionSec: 5, holdSec: 20 },
        { poseId: "side_relaxed",  transitionSec: 5, holdSec: 20 },
        { poseId: "front_relaxed", transitionSec: 5, holdSec: 20 }
      ]
    },
    classic_muscularity: {
      id: "classic_muscularity",
      label: "Classic Muscularity",
      loopMode: "repeat",
      repeatCount: 1,
      loopRestSec: 0,
      items: [
        { poseId: "front_double_biceps",  transitionSec: 6, holdSec: 25 },
        { poseId: "side_chest_left",      transitionSec: 6, holdSec: 25 },
        { poseId: "side_triceps_left",    transitionSec: 6, holdSec: 25 },
        { poseId: "back_double_biceps",   transitionSec: 6, holdSec: 25 },
        { poseId: "side_chest_right",     transitionSec: 6, holdSec: 25 },
        { poseId: "side_triceps_right",   transitionSec: 6, holdSec: 25 },
        { poseId: "abdominals_and_thigh", transitionSec: 6, holdSec: 25 },
        { poseId: "most_muscular",        transitionSec: 6, holdSec: 25 },
        { poseId: "twisted_back_double",  transitionSec: 6, holdSec: 25 }
      ]
    },
    favourites_vacuum_flow: {
      id: "favourites_vacuum_flow",
      label: "Favourites — Vacuum Flow",
      loopMode: "repeat",
      repeatCount: 1,
      loopRestSec: 0,
      items: [
        { poseId: "vacuum",   transitionSec: 6, holdSec: 18 },
        { poseId: "teacup",   transitionSec: 6, holdSec: 18 },
        { poseId: "archer",   transitionSec: 6, holdSec: 18 },
        { poseId: "victory",  transitionSec: 6, holdSec: 18 },
        { poseId: "crucifix", transitionSec: 6, holdSec: 18 }
      ]
    }
  }), [/* none */]);

  // timer
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | countdown | transition | hold
  const [idx, setIdx] = useState(0);
  const [elapsedInPhase, setElapsedInPhase] = useState(0);
  const [queue, setQueue] = useState([]);
  const [nowLabel, setNowLabel] = useState("Ready");
  const [tensionElapsed, setTensionElapsed] = useState(0);
  const [transitionElapsed, setTransitionElapsed] = useState(0);
  const [toast, setToast] = useState("");
  const halfwayGivenRef = useRef(false);

  // swipe
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const swipeBoxRef = useRef(null);
  useEffect(() => {
    const el = swipeBoxRef.current;
    if (!el) return;
    const onStart = (e) => { const t = e.touches[0]; touchStartX.current = t.clientX; touchStartY.current = t.clientY; };
    const onEnd = (e) => {
      if (touchStartX.current == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX.current;
      const dy = t.clientY - touchStartY.current;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) { if (dx < 0) next(); else prev(); }
      touchStartX.current = null; touchStartY.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchend", onEnd); };
  }, [queue, idx]);

  // keyboard (desktop)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); isRunning ? pause() : start(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.code === "ArrowRight") { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // selection state for presets
  const [usingMaster, setUsingMaster] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState("classic_muscularity");

  // per-preset simple adjustments (plain English)
  const [presetAdjust, setPresetAdjust] = useState({
    everyHoldSec: "",
    everyTransitionSec: "",
    loopRepeatCount: "",
    loopRestSec: ""
  });

  // builder state
  const [build, setBuild] = useState({
    name: "My Playlist",
    loopMode: "repeat",
    repeatCount: 1,
    loopRestSec: 0,
    totalDurationSec: 240,
    items: []
  });
  const [builderTab, setBuilderTab] = useState(0);
  const [importText, setImportText] = useState("");

  // pose info dialog
  const [poseInfoOpen, setPoseInfoOpen] = useState(false);
  const [poseInfo, setPoseInfo] = useState(null);
  function openPoseInfo(poseId) {
    const p = POSE_MAP[poseId] || { id: poseId, label: poseId };
    setPoseInfo(p);
    setPoseInfoOpen(true);
  }

  // Add Pose dialog
  const [addPoseOpen, setAddPoseOpen] = useState(false);
  const [newPose, setNewPose] = useState({
    label: "",
    id: "",
    category: "favourite",
    defaultTransitionSec: 6,
    defaultHoldSec: 20,
    voiceAlias: "",
    imageHint: "",
    description: "",
    cues: "",
    mistakes: ""
  });
  function normaliseIdFromLabel(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function saveNewPose() {
    const label = newPose.label.trim();
    if (!label) return setToast("Give the pose a name");
    const id = (newPose.id.trim() || normaliseIdFromLabel(label)) || `pose_${Date.now()}`;
    if (POSE_MAP[id]) return setToast("A pose with that ID already exists");
    const pose = {
      id,
      label,
      category: newPose.category,
      description: newPose.description.trim() || undefined,
      cues: newPose.cues ? newPose.cues.split("\n").map(s=>s.trim()).filter(Boolean) : undefined,
      mistakes: newPose.mistakes ? newPose.mistakes.split("\n").map(s=>s.trim()).filter(Boolean) : undefined,
      imageHint: newPose.imageHint.trim() || undefined,
      voiceAlias: newPose.voiceAlias.trim() || undefined,
      defaultTransitionSec: Math.max(0, Number(newPose.defaultTransitionSec)||0),
      defaultHoldSec: Math.max(0, Number(newPose.defaultHoldSec)||0)
    };
    setCustomPoses(arr => [pose, ...arr]);
    setAddPoseOpen(false);
    setNewPose({...newPose, label:"", id:""});
    setToast(`Added pose: ${pose.label}`);
  }
  function deleteCustomPose(id) {
    setCustomPoses(arr => arr.filter(p => p.id !== id));
    setToast("Deleted pose");
  }

  // import from shared link if present
  useEffect(() => {
    const shared = decodePresetFromLink();
    if (!shared) return;
    const custom = {
      name: shared.label || "Shared preset",
      loopMode: "repeat",
      repeatCount: Math.max(1, Number(shared.repeatCount)||1),
      loopRestSec: Math.max(0, Number(shared.loopRestSec)||0),
      items: shared.items.map(it => ({
        poseId: it.poseId,
        transitionSec: shared.everyTransitionSec != null ? Number(shared.everyTransitionSec) : it.transitionSec,
        holdSec: shared.everyHoldSec != null ? Number(shared.everyHoldSec) : it.holdSec
      }))
    };
    setPlaylists(pl => {
      const others = pl.filter(p => p.name !== custom.name);
      return [{ ...custom }, ...others];
    });
    setCurrentPresetKey(`custom_${custom.name}`);
    setUsingMaster(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    window.history.replaceState({}, "", url);
    setToast(`Imported shared preset: ${custom.name}`);
  }, []);

  // rebuild queue when inputs change
  useEffect(() => resetAll(), [currentPresetKey, usingMaster, settings.randomizeFavourites, playlists, presetAdjust, customPoses]);

  function withRandom(p) {
    if (settings.randomizeFavourites) {
      if (p.id?.includes("favourites") || p.id === "classic_muscularity") return { ...p, items: shuffle(p.items) };
    }
    return p;
  }
  const allSelectablePresets = useMemo(() => {
    const builtins = Object.values(PRESETS);
    const customs = playlists.map((pl) => ({
      id: `custom_${pl.name}`, label: `Custom — ${pl.name}`,
      loopMode: pl.loopMode || "repeat",
      repeatCount: pl.repeatCount || 1,
      loopRestSec: pl.loopRestSec || 0,
      items: pl.items
    }));
    return [...builtins, ...customs];
  }, [playlists, PRESETS]);

  function findPresetById(id) {
    const built = PRESETS[id];
    if (built) return built;
    if (id.startsWith("custom_")) {
      const name = id.replace(/^custom_/, "");
      const pl = playlists.find(p => p.name === name);
      if (pl) {
        return {
          id: `custom_${pl.name}`, label: `Custom — ${pl.name}`,
          loopMode: pl.loopMode || "repeat",
          repeatCount: pl.repeatCount || 1,
          loopRestSec: pl.loopRestSec || 0,
          items: pl.items
        };
      }
    }
    return PRESETS.classic_muscularity;
  }
  function effectivePreset() {
    const base = withRandom(findPresetById(currentPresetKey));
    const rc = presetAdjust.loopRepeatCount !== "" ? Math.max(1, Number(presetAdjust.loopRepeatCount) || 1) : base.repeatCount;
    const rest = presetAdjust.loopRestSec !== "" ? Math.max(0, Number(presetAdjust.loopRestSec) || 0) : (base.loopRestSec || 0);
    return { ...base, repeatCount: rc, loopRestSec: rest };
  }

  function resetAll() {
    setIsRunning(false); setPhase("idle"); setIdx(0); setElapsedInPhase(0);
    setTensionElapsed(0); setTransitionElapsed(0); halfwayGivenRef.current = false;
    if (usingMaster) {
      const blocks = assembleFromMaster({
        id: "classic_full_session",
        label: "Classic Full Session",
        sequence: [
          { presetRef: "classic_symmetry_loop", override: { repeatCount: 2 } },
          { presetRef: "classic_muscularity" },
          { presetRef: "favourites_vacuum_flow" }
        ],
        global: { autoAdvance: true }
      }, PRESETS).map(withRandom);
      const flat = blocks.flatMap(p => buildRunItems(p, presetAdjust));
      setQueue(flat);
    } else {
      const p = effectivePreset();
      setQueue(buildRunItems(p, presetAdjust));
    }
    setNowLabel("Ready");
  }

  const currentItem = queue[idx];

  // timer run: announce and start phase
  useEffect(() => {
    if (!isRunning || !currentItem) return;
    const trans = Math.max(0, currentItem.transitionSec || 0);

    if (elapsedInPhase === 0) {
      halfwayGivenRef.current = false;
      if (currentItem.isLoopRest) {
        setNowLabel(`Rest between loops`);
        if (settings.beepOnTransition) beep(100);
      } else {
        const pose = POSE_MAP[currentItem.poseId];
        let announceText = pose?.voiceAlias || pose?.label || currentItem.poseId;
        const isSym = pose?.category === "symmetry";
        if (isSym && currentItem.needsQuarterTurn && settings.includeTurningCues) {
          announceText = `Quarter turn to the right. ${announceText}`;
        }
        if (settings.voiceEnabled) speak(announceText, voices[voiceIndex], voiceRate);
        setNowLabel(announceText);
        if (settings.beepOnTransition) { beep(100); vibrate(30); }
      }
    }

    if (currentItem.isLoopRest) {
      setPhase("transition");
    } else {
      setPhase(trans > 0 ? "transition" : "countdown");
    }

    const h = setInterval(() => setElapsedInPhase((e) => e + 0.1), 100);
    return () => clearInterval(h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, idx]);

  // phase machine + halfway cue
  useEffect(() => {
    if (!isRunning || !currentItem) return;

    const trans = Math.max(0, currentItem.transitionSec || 0);
    const hold = Math.max(0, currentItem.holdSec || 0);

    if (phase === "transition") setTransitionElapsed(t => t + 0.1);
    if (phase === "hold") {
      setTensionElapsed(t => t + 0.1);
      if (settings.halfwayCue && !currentItem.isLoopRest && hold > 4) {
        const half = hold / 2;
        if (!halfwayGivenRef.current && elapsedInPhase >= half) {
          halfwayGivenRef.current = true;
          if (settings.beepOnTransition) beep(140, 1200, 0.25);
          if (settings.voiceEnabled) speak("Halfway", voices[voiceIndex], voiceRate);
        }
      }
    }

    if (phase === "transition" && elapsedInPhase >= trans) {
      if (currentItem.isLoopRest) {
        next();
        return;
      }
      setPhase("countdown"); setElapsedInPhase(0);
      setTimeout(() => beep(120, 1000, 0.22), 0);
      setTimeout(() => beep(120, 1000, 0.22), 1000);
      setTimeout(() => beep(180, 1400, 0.28), 2000);
    }

    if (phase === "countdown" && elapsedInPhase >= 3) {
      setPhase("hold"); setElapsedInPhase(0);
    }

    if (phase === "hold" && elapsedInPhase >= hold) {
      if (settings.roundHoldTargetSec > 0 && Math.floor(tensionElapsed) >= settings.roundHoldTargetSec) {
        stopAndLog("Round target reached"); return;
      }
      setElapsedInPhase(0);
      next();
    }
  }, [elapsedInPhase, phase, isRunning, currentItem, settings.roundHoldTargetSec, tensionElapsed, settings.halfwayCue, voiceIndex, voiceRate, voices]);

  // remaining time
  const totalRemainingSec = useMemo(() => {
    let rem = 0;
    if (!queue.length) return 0;
    const cur = queue[idx];
    if (cur) {
      if (phase === "transition") rem += Math.max(0, (cur.transitionSec || 0) - elapsedInPhase);
      if (phase === "countdown") rem += Math.max(0, 3 - elapsedInPhase) + (cur.holdSec || 0);
      if (phase === "hold") rem += Math.max(0, (cur.holdSec || 0) - elapsedInPhase);
    }
    for (let i = idx + 1; i < queue.length; i++) {
      const it = queue[i];
      if (it.isLoopRest) rem += (it.transitionSec || 0);
      else rem += (it.transitionSec || 0) + (it.holdSec || 0) + 3;
    }
    return rem;
  }, [queue, idx, phase, elapsedInPhase]);

  // controls
  function start() { if (!queue.length || isRunning) return; setIsRunning(true); setElapsedInPhase(0); if (settings.keepAwake) requestWakeLock(); }
  function pause() { setIsRunning(false); releaseWakeLock(); }
  function next() {
    if (!queue.length) return;
    const last = idx + 1 >= queue.length;
    if (last) { stopAndLog("Session complete"); return; }
    setIdx(i => i + 1);
    setElapsedInPhase(0);
    halfwayGivenRef.current = false;
  }
  function prev() {
    if (!queue.length) return;
    if (idx === 0) return;
    setIdx(i => i - 1);
    setElapsedInPhase(0);
    halfwayGivenRef.current = false;
  }
  function resetSession() {
    setIsRunning(false);
    setPhase("idle");
    setIdx(0);
    setElapsedInPhase(0);
    setTensionElapsed(0);
    setTransitionElapsed(0);
    halfwayGivenRef.current = false;
    setNowLabel("Ready");
    releaseWakeLock();
  }
  function stopSession() {
    setIsRunning(false);
    setPhase("idle");
    setNowLabel("Stopped");
    setElapsedInPhase(0);
    releaseWakeLock();
  }
  function stopAndLog(msg) {
    setIsRunning(false); setPhase("idle"); setNowLabel(msg);
    const total = tensionElapsed + transitionElapsed;
    const posesDone = idx + 1;
    setHistory(h => [{ date: new Date().toISOString(), tensionSec: Math.floor(tensionElapsed), totalSec: Math.floor(total), poses: posesDone }, ...h].slice(0, 200));
    setToast(msg);
    releaseWakeLock();
  }

  // library from merged poses
  const LIB = {
    symmetry: Object.values(POSE_MAP).filter(p => p.category === "symmetry"),
    muscularity: Object.values(POSE_MAP).filter(p => p.category === "muscularity" || p.id === "most_muscular"),
    favourite: Object.values(POSE_MAP).filter(p => p.category === "favourite")
  };

  // builder helpers
  function addItem(poseId, t, h) {
    setBuild(b => ({ ...b, items: [...b.items, { poseId, transitionSec: Math.max(0, Number(t)||0), holdSec: Math.max(0, Number(h)||0) }] }));
  }
  function savePlaylist() {
    if (!build.name.trim()) return setToast("Name your playlist");
    if (!build.items.length) return setToast("Add at least one item");
    setPlaylists(pls => { const others = pls.filter(p => p.name !== build.name.trim()); return [...others, { ...build, name: build.name.trim() }]; });
    setToast("Saved playlist");
  }
  function exportPlaylists() { const data = JSON.stringify(playlists, null, 2); navigator.clipboard.writeText(data).then(() => setToast("Copied playlists JSON")); }
  function importPlaylists() { try { const arr = JSON.parse(importText); if (!Array.isArray(arr)) throw new Error("Invalid JSON"); setPlaylists(arr); setImportText(""); setToast("Imported playlists"); } catch (e) { setToast(`Import failed: ${e.message}`); } }
  function loadPlaylist(name) { const p = playlists.find(x => x.name === name); if (!p) return; setCurrentPresetKey(`custom_${p.name}`); setUsingMaster(false); setTab(0); setToast(`Loaded ${p.name}`); }
  function deletePlaylist(name) { if (!confirm(`Delete "${name}"?`)) return; setPlaylists(pls => pls.filter(p => p.name !== name)); if (currentPresetKey === `custom_${name}`) setCurrentPresetKey("classic_muscularity"); setToast("Deleted"); }

  // labels
  const remain = fmt(totalRemainingSec);
  const bigDigitsStyle = settings.bigDigits ? { fontSize: isDesktop ? 96 : 68, lineHeight: 1.05 } : {};
  const smallDigitsStyle = settings.bigDigits ? { fontSize: isDesktop ? 18 : 16 } : {};

  // UI: Session
  const SessionScreen = (
    <Box ref={swipeBoxRef} sx={{ px: 0, pb: 4 }}>
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        {/* Top control bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Back (previous pose)"><IconButton onClick={prev}><SkipPrevious /></IconButton></Tooltip>
            {isRunning ? (
              <Tooltip title="Pause"><IconButton onClick={pause}><Pause /></IconButton></Tooltip>
            ) : (
              <Tooltip title="Play"><IconButton onClick={start}><PlayArrow /></IconButton></Tooltip>
            )}
            <Tooltip title="Skip (next pose)"><IconButton onClick={next}><SkipNext /></IconButton></Tooltip>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="Reset session to the beginning"><Button size="small" variant="outlined" onClick={resetSession}>Reset</Button></Tooltip>
            <Tooltip title="Stop session"><Button size="small" color="error" variant="outlined" onClick={stopSession}>Stop</Button></Tooltip>
          </Box>
        </Box>

        <Typography variant="overline" color="text.secondary">Now</Typography>
        <Typography variant="h6" sx={{ mb: 1 }}>{nowLabel}</Typography>

        <Typography variant="overline" color="text.secondary">Time left in this session</Typography>
        <Typography variant="h3" sx={{ fontVariantNumeric: "tabular-nums", ...bigDigitsStyle }}>{remain}</Typography>

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={4}><Typography variant="caption" color="text.secondary" sx={smallDigitsStyle}>Time under tension</Typography><Typography sx={smallDigitsStyle}>{fmt(tensionElapsed)}</Typography></Grid>
          <Grid item xs={4}><Typography variant="caption" color="text.secondary" sx={smallDigitsStyle}>Transitions</Typography><Typography sx={smallDigitsStyle}>{fmt(transitionElapsed)}</Typography></Grid>
          <Grid item xs={4}>
            <Typography variant="caption" color="text.secondary" sx={smallDigitsStyle}>Round target</Typography>
            <Typography sx={smallDigitsStyle}>
              {settings.roundHoldTargetSec > 0 ? `${fmt(settings.roundHoldTargetSec)} left ${fmt(Math.max(0, settings.roundHoldTargetSec - Math.floor(tensionElapsed)))}` : "off"}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2 }} variant="outlined">
        <Typography variant="overline" color="text.secondary">Coming up</Typography>
        <Box sx={{ maxHeight: 260, overflow: "auto", mt: 1 }}>
          {queue.slice(idx, idx + 6).map((it, i) => {
            const pose = it.isLoopRest ? { label: "Rest between loops" } : (POSE_MAP[it.poseId] || { label: it.poseId });
            return (
              <Box key={i} sx={{
                p: 1, mb: 1, border: "1px solid", borderColor: "divider", borderRadius: 1,
                bgcolor: i === 0 ? "action.hover" : "transparent", display: "flex", alignItems: "center", gap: 1
              }}>
                {!it.isLoopRest && <PoseThumb id={it.poseId} size={48} radius={8} />}
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="body1"><b>{i === 0 ? "▶ " : ""}{pose.label}</b></Typography>
                    {!it.isLoopRest && (
                      <Tooltip title="How to do this pose">
                        <IconButton size="small" onClick={()=>openPoseInfo(it.poseId)}><Info fontSize="inherit" /></IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {it.isLoopRest ? `Rest ${it.transitionSec || 0}s` : `Transition ${it.transitionSec || 0}s · Hold ${it.holdSec || 0}s`}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );

  // UI: Presets with adjustments + thumbnails + share + delete
  const PresetsScreen = (
    <Box sx={{ pb: 8 }}>
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <FormControlLabel
          control={<Switch checked={usingMaster} onChange={(e)=>setUsingMaster(e.target.checked)} />}
          label="Classic Full Session (all rounds in one)"
        />
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={1}>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="Set one hold length that applies to every pose in this routine. Leave blank to keep each pose’s own hold time.">
              <TextField fullWidth label="Make every pose hold (seconds)" type="number" inputProps={{ min: 0 }}
                         value={presetAdjust.everyHoldSec} onChange={(e)=>setPresetAdjust(a=>({ ...a, everyHoldSec: e.target.value }))}/>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="Set one transition time between poses. Leave blank to keep each pose’s own transition.">
              <TextField fullWidth label="Make every transition (seconds)" type="number" inputProps={{ min: 0 }}
                         value={presetAdjust.everyTransitionSec} onChange={(e)=>setPresetAdjust(a=>({ ...a, everyTransitionSec: e.target.value }))}/>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="How many times to repeat this entire routine from top to bottom.">
              <TextField fullWidth label="Repeat this routine (times)" type="number" inputProps={{ min: 1 }}
                         value={presetAdjust.loopRepeatCount} onChange={(e)=>setPresetAdjust(a=>({ ...a, loopRepeatCount: e.target.value }))}/>
            </Tooltip>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Tooltip title="Add a rest break between each loop. This is extra time after the last pose before the routine starts again.">
              <TextField fullWidth label="Rest between loops (seconds)" type="number" inputProps={{ min: 0 }}
                         value={presetAdjust.loopRestSec} onChange={(e)=>setPresetAdjust(a=>({ ...a, loopRestSec: e.target.value }))}/>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ display: "grid", gap: 1 }}>
        {allSelectablePresets.map(preset => {
          const p = findPresetById(preset.id);
          return (
            <Accordion key={preset.id} disableGutters sx={{ border: "1px solid", borderColor: "divider" }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%", pr: 1 }}>
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>{p.label}</Typography>

                  {/* Share link */}
                  <Tooltip title="Copy a link you can send to someone">
                    <Button size="small" variant="outlined" onClick={(e) => {
                      e.stopPropagation();
                      const link = encodePresetToLink(p, presetAdjust);
                      navigator.clipboard.writeText(link).then(() => setToast("Share link copied"));
                    }}>Share</Button>
                  </Tooltip>

                  <Tooltip title="Load this routine with your settings and start right away">
                    <Button size="small" variant="contained" onClick={(e) => {
                      e.stopPropagation();
                      setCurrentPresetKey(p.id);
                      setUsingMaster(false);
                      resetAll();
                      setTab(0);
                      setTimeout(start, 10);
                    }}>Start</Button>
                  </Tooltip>

                  {/* Delete custom */}
                  {String(p.id).startsWith("custom_") && (
                    <Tooltip title="Delete this custom playlist">
                      <Button size="small" color="error" variant="outlined" onClick={(e) => {
                        e.stopPropagation();
                        const name = p.id.replace(/^custom_/, "");
                        if (confirm(`Delete "${name}"?`)) { deletePlaylist(name); }
                      }}>Delete</Button>
                    </Tooltip>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="caption" color="text.secondary">
                  By default: repeat ×{p.repeatCount}{p.loopRestSec ? ` · rest ${p.loopRestSec}s between loops` : ""}
                </Typography>
                <Box sx={{ mt: 1, display: "grid", gap: 0.5 }}>
                  {p.items.map((it, i) => {
                    const pose = POSE_MAP[it.poseId];
                    return (
                      <Box key={i} sx={{ p: 1, border: "1px dashed", borderColor: "divider", borderRadius: 1, display: "flex", alignItems: "center", gap: 1 }}>
                        <PoseThumb id={it.poseId} size={40} radius={6} />
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="body2"><b>{pose?.label || it.poseId}</b></Typography>
                            <Tooltip title="How to do this pose">
                              <IconButton size="small" onClick={()=>openPoseInfo(it.poseId)}><Info fontSize="inherit" /></IconButton>
                            </Tooltip>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            Transition {it.transitionSec || 0}s · Hold {it.holdSec || 0}s
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Box>
  );

  // UI: Build
  const BuildScreen = (
    <Box sx={{ pb: 8 }}>
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} sm={5}><TextField fullWidth label="Playlist name" value={build.name} onChange={(e) => setBuild(b => ({ ...b, name: e.target.value }))} /></Grid>
          <Grid item xs={6} sm={3}>
            <FormControl fullWidth>
              <InputLabel id="mode">Mode</InputLabel>
              <Select labelId="mode" label="Mode" value={build.loopMode} onChange={(e) => setBuild(b => ({ ...b, loopMode: e.target.value }))}>
                <MenuItem value="repeat">Repeat</MenuItem>
                <MenuItem value="duration">Duration</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            {build.loopMode === "repeat" ? (
              <TextField fullWidth label="Repeat count" type="number" inputProps={{ min: 1 }} value={build.repeatCount}
                         onChange={(e) => setBuild(b => ({ ...b, repeatCount: Math.max(1, Number(e.target.value)||1) }))}/>
            ) : (
              <TextField fullWidth label="Total seconds" type="number" inputProps={{ min: 10 }} value={build.totalDurationSec}
                         onChange={(e) => setBuild(b => ({ ...b, totalDurationSec: Math.max(10, Number(e.target.value)||10) }))}/>
            )}
          </Grid>
          <Grid item xs={12} sm="auto">
            <Button variant="outlined" onClick={()=>setAddPoseOpen(true)}>Add a pose</Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <Tabs value={builderTab} onChange={(_, v) => setBuilderTab(v)}>
          <Tab label="Symmetry"/><Tab label="Muscularity"/><Tab label="Favourites"/>
        </Tabs>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {(builderTab===0?LIB.symmetry:builderTab===1?LIB.muscularity:LIB.favourite).map(p => {
            const defT = p.defaultTransitionSec != null ? p.defaultTransitionSec : (builderTab===0?5:6);
            const defH = p.defaultHoldSec != null ? p.defaultHoldSec : (builderTab===0?20:25);
            return (
              <Grid item xs={12} sm={6} md={4} key={p.id}>
                <Card variant="outlined">
                  <CardContent sx={{ pb: 1.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <PoseThumb id={p.imageHint || p.id} size={36} radius={6} />
                      <Typography variant="body2" fontWeight={600}>{p.label}</Typography>
                    </Box>
                    <Grid container spacing={1} sx={{ mt: 0.5 }}>
                      <Grid item xs={6}><TextField fullWidth label="Transition s" type="number" defaultValue={defT} id={`t-${p.id}`} /></Grid>
                      <Grid item xs={6}><TextField fullWidth label="Hold s" type="number" defaultValue={defH} id={`h-${p.id}`} /></Grid>
                    </Grid>
                  </CardContent>
                  <CardActions sx={{ pt: 0 }}>
                    <Button size="small" variant="contained" onClick={() => {
                      const t = Number(document.getElementById(`t-${p.id}`).value)||0;
                      const h = Number(document.getElementById(`h-${p.id}`).value)||0;
                      addItem(p.id, t, h);
                    }}>Add</Button>
                    <Tooltip title="How to do this pose"><IconButton size="small" onClick={()=>openPoseInfo(p.id)}><Info fontSize="inherit" /></IconButton></Tooltip>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <Typography variant="overline" color="text.secondary">Playlist items</Typography>
        <Box sx={{ maxHeight: 280, overflow: "auto", mt: 1, display: "grid", gap: 1 }}>
          {build.items.map((it, i) => {
            const pose = POSE_MAP[it.poseId] || { label: it.poseId };
            return (
              <Card key={i} variant="outlined">
                <CardContent sx={{ py: 1.2 }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12}><Typography variant="body2" fontWeight={600}>{pose.label}</Typography></Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth label="Transition s" type="number" value={it.transitionSec}
                                 onChange={(e) => {
                                   const val = Math.max(0, Number(e.target.value)||0);
                                   setBuild(b => { const arr=b.items.slice(); arr[i]={...arr[i], transitionSec: val}; return {...b, items:arr}; });
                                 }} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth label="Hold s" type="number" value={it.holdSec}
                                 onChange={(e) => {
                                   const val = Math.max(0, Number(e.target.value)||0);
                                   setBuild(b => { const arr=b.items.slice(); arr[i]={...arr[i], holdSec: val}; return {...b, items:arr}; });
                                 }} />
                    </Grid>
                  </Grid>
                </CardContent>
                <CardActions sx={{ pt: 0 }}>
                  <Button size="small" color="error" onClick={() => setBuild(b => ({ ...b, items: b.items.filter((_, idx) => idx !== i) }))}>Remove</Button>
                </CardActions>
              </Card>
            );
          })}
        </Box>
        <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={savePlaylist}>Save</Button>
          <Button variant="text" onClick={() => setBuild({ name: "My Playlist", loopMode: "repeat", repeatCount: 1, loopRestSec: 0, totalDurationSec: 240, items: [] })}>Clear</Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }} variant="outlined">
        <Typography variant="overline" color="text.secondary">Export / Import</Typography>
        <Box sx={{ mt: 1, display: "grid", gap: 1 }}>
          <Button variant="outlined" onClick={exportPlaylists}>Copy playlists JSON</Button>
          <TextField multiline minRows={3} placeholder="Paste playlists JSON to import" value={importText} onChange={(e)=>setImportText(e.target.value)} />
          <Button variant="text" onClick={importPlaylists}>Import</Button>
        </Box>
      </Paper>
    </Box>
  );

  const HistoryScreen = (
    <Box sx={{ pb: 8 }}>
      <Paper sx={{ p: 2 }} variant="outlined">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="overline" color="text.secondary">Recent sessions</Typography>
          <Button size="small" variant="outlined" onClick={() => exportHistoryCSV(history)}>Export CSV</Button>
        </Box>
        <Box sx={{ mt: 1, display: "grid", gap: 1 }}>
          {history.length === 0 && <Typography variant="body2" color="text.secondary">No sessions yet</Typography>}
          {history.map((h, i) => (
            <Card key={i} variant="outlined">
              <CardContent sx={{ py: 1.2 }}>
                <Typography variant="body2" fontWeight={600}>{new Date(h.date).toLocaleString()}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Tension {fmt(h.tensionSec)} · Total {fmt(h.totalSec)} · Poses {h.poses}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Paper>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1 }}>Lil’ Poser Posing Timer</Typography>
          <Tooltip title="Dark mode"><FormControlLabel sx={{ mr: 1 }} control={<Switch checked={dark} onChange={(e)=>setDark(e.target.checked)} />} label="Dark" /></Tooltip>
          <Tooltip title="Smaller controls if you prefer a tighter layout"><FormControlLabel sx={{ mr: 1 }} control={<Switch checked={compact} onChange={(e)=>setCompact(e.target.checked)} />} label="Compact" /></Tooltip>
          <IconButton onClick={() => setSettingsOpen(true)}><SettingsIcon /></IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth={isDesktop ? "sm" : false} disableGutters={!isDesktop} sx={{ pt: 1 }}>
        {tab === 0 && SessionScreen}
        {tab === 1 && PresetsScreen}
        {tab === 2 && BuildScreen}
        {tab === 3 && HistoryScreen}
      </Container>

      <Paper sx={{ position: "fixed", left: 0, right: 0, bottom: 0 }} elevation={3}>
        <BottomNavigation value={tab} onChange={(_, v) => setTab(v)} showLabels>
          <BottomNavigationAction label="Session" icon={<FitnessCenter />} />
          <BottomNavigationAction label="Presets" icon={<PlaylistPlay />} />
          <BottomNavigationAction label="Build" icon={<Build />} />
          <BottomNavigationAction label="History" icon={<HistoryIcon />} />
        </BottomNavigation>
      </Paper>

      {/* Settings drawer */}
      <Drawer anchor="bottom" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <Box sx={{ p: 2, maxWidth: 720, mx: "auto" }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>Settings</Typography>
            <IconButton onClick={() => setSettingsOpen(false)}><Close /></IconButton>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={settings.includeTurningCues} onChange={(e)=>setSettings(s=>({...s, includeTurningCues:e.target.checked}))} />} label="Say quarter turns during symmetry" />
              <FormControlLabel control={<Switch checked={settings.voiceEnabled} onChange={(e)=>setSettings(s=>({...s, voiceEnabled:e.target.checked}))} />} label="Announce poses out loud" />
              <FormControlLabel control={<Switch checked={settings.beepOnTransition} onChange={(e)=>setSettings(s=>({...s, beepOnTransition:e.target.checked}))} />} label="Beep at each transition" />
              <FormControlLabel control={<Switch checked={settings.halfwayCue} onChange={(e)=>setSettings(s=>({...s, halfwayCue:e.target.checked}))} />} label="Say halfway during holds" />
              <FormControlLabel control={<Switch checked={settings.bigDigits} onChange={(e)=>setSettings(s=>({...s, bigDigits:e.target.checked}))} />} label="Big digits mode" />
              <FormControlLabel control={<Switch checked={settings.keepAwake} onChange={(e)=>setSettings(s=>({...s, keepAwake:e.target.checked}))} />} label="Keep screen awake while timing" />
              <FormControlLabel control={<Switch checked={settings.randomizeFavourites} onChange={(e)=>setSettings(s=>({...s, randomizeFavourites:e.target.checked}))} />} label="Shuffle favourites/muscularity" />
              <FormControlLabel control={
                <Switch checked={showIntro} onChange={(e)=>{ setShowIntro(e.target.checked); localStorage.setItem("lp_showIntro", e.target.checked ? "true":"false"); }} />
              } label="Show instructions at startup" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!settings.voiceEnabled} sx={{ mb: 1 }}>
                <InputLabel id="voice">Voice</InputLabel>
                <Select labelId="voice" label="Voice" value={voiceIndex} onChange={(e)=>setVoiceIndex(Number(e.target.value))}>
                  {voices.map((v,i)=>(<MenuItem key={i} value={i}>{v.name} {v.lang?`(${v.lang})`:""}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField fullWidth label={`Voice speed (${voiceRate.toFixed(1)}x)`} type="range"
                         inputProps={{ min: 0.6, max: 1.4, step: 0.1 }}
                         value={voiceRate} onChange={(e)=>setVoiceRate(Number(e.target.value))} disabled={!settings.voiceEnabled} />
              <TextField fullWidth sx={{ mt: 2 }} label="Stop when total hold time reaches (seconds)" type="number"
                         inputProps={{ min: 0 }} value={settings.roundHoldTargetSec}
                         onChange={(e)=>setSettings(s=>({...s, roundHoldTargetSec: Math.max(0, Number(e.target.value)||0)}))} />
              <Box sx={{ mt: 1 }}>
                <Button size="small" startIcon={<Info />} onClick={()=>setShowIntro(true)}>Open instructions</Button>
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, textAlign: "right" }}>
            <Button onClick={()=>setSettingsOpen(false)}>Close</Button>
          </Box>
        </Box>
      </Drawer>

      {/* First-load instructions */}
      <Dialog open={showIntro} onClose={()=>{ setShowIntro(false); localStorage.setItem("lp_showIntro","false"); }}>
        <DialogTitle>Welcome to Lil’ Poser</DialogTitle>
        <DialogContent dividers>
          <Typography gutterBottom><b>Quick start</b>: go to <i>Presets</i>, pick a routine, set your loop repeats and rest, then hit <b>Start</b>.</Typography>
          <Typography gutterBottom><b>During practice</b>: swipe left/right to move poses. We announce poses out loud and add 3-2-1 beeps into every hold.</Typography>
          <Typography gutterBottom><b>Tension time</b> counts only the holds. Use the target in Settings to auto-stop when you’ve held enough.</Typography>
          <Typography gutterBottom><b>Playlists</b>: build your own rounds in <i>Build</i>, save them, and they’ll appear under Presets.</Typography>
          <Typography gutterBottom>If you ever want to see this again, open <i>Settings → Open instructions</i>.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>{ setShowIntro(false); localStorage.setItem("lp_showIntro","false"); }}>Got it</Button>
        </DialogActions>
      </Dialog>

      {/* Pose info dialog */}
      <Dialog open={poseInfoOpen} onClose={()=>setPoseInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{poseInfo?.label || "Pose"}</DialogTitle>
        <DialogContent dividers>
          {poseInfo?.imageHint && (
            <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
              <img
                src={`/poses/${poseInfo.imageHint}.svg`}
                onError={(e)=>{ e.currentTarget.src = `/poses/${poseInfo.imageHint}.png`; }}
                alt=""
                width="160" height="160"
                style={{ borderRadius: 12, objectFit: "cover" }}
              />
            </Box>
          )}
          {poseInfo?.description && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2">How it should look and feel</Typography>
              <Typography variant="body2">{poseInfo.description}</Typography>
            </Box>
          )}
          {poseInfo?.cues?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2">Cues</Typography>
              <ul style={{ marginTop: 6 }}>
                {poseInfo.cues.map((c,i)=>(<li key={i}><Typography variant="body2">{c}</Typography></li>))}
              </ul>
            </Box>
          )}
          {poseInfo?.mistakes?.length > 0 && (
            <Box>
              <Typography variant="subtitle2">Common mistakes</Typography>
              <ul style={{ marginTop: 6 }}>
                {poseInfo.mistakes.map((m,i)=>(<li key={i}><Typography variant="body2">{m}</Typography></li>))}
              </ul>
            </Box>
          )}
          {!poseInfo?.description && !poseInfo?.cues && !poseInfo?.mistakes && (
            <Typography variant="body2" color="text.secondary">No details yet — add them in poses.js or via “Add a pose”.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setPoseInfoOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add pose dialog */}
      <Dialog open={addPoseOpen} onClose={()=>setAddPoseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add a pose</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={1}>
            <Grid item xs={12}><TextField fullWidth label="Pose name" value={newPose.label} onChange={(e)=>setNewPose(p=>({...p, label:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Pose ID (optional)" helperText="leave empty to auto-generate from the name" value={newPose.id} onChange={(e)=>setNewPose(p=>({...p, id:e.target.value}))} /></Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="cat">Category</InputLabel>
                <Select labelId="cat" label="Category" value={newPose.category} onChange={(e)=>setNewPose(p=>({...p, category:e.target.value}))}>
                  <MenuItem value="symmetry">Symmetry</MenuItem>
                  <MenuItem value="muscularity">Muscularity</MenuItem>
                  <MenuItem value="favourite">Favourites</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="number" label="Default transition s" value={newPose.defaultTransitionSec} onChange={(e)=>setNewPose(p=>({...p, defaultTransitionSec:e.target.value}))} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="number" label="Default hold s" value={newPose.defaultHoldSec} onChange={(e)=>setNewPose(p=>({...p, defaultHoldSec:e.target.value}))} /></Grid>

            <Grid item xs={12}><TextField fullWidth label="Voice phrase (optional)" value={newPose.voiceAlias} onChange={(e)=>setNewPose(p=>({...p, voiceAlias:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Thumbnail filename (e.g., my_pose.svg or my_pose.png)" value={newPose.imageHint} onChange={(e)=>setNewPose(p=>({...p, imageHint:e.target.value}))} /></Grid>

            <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="How it should look and feel (optional)" value={newPose.description} onChange={(e)=>setNewPose(p=>({...p, description:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Cues — one per line (optional)" value={newPose.cues} onChange={(e)=>setNewPose(p=>({...p, cues:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Common mistakes — one per line (optional)" value={newPose.mistakes} onChange={(e)=>setNewPose(p=>({...p, mistakes:e.target.value}))} /></Grid>
          </Grid>

          {customPoses.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="overline" color="text.secondary">Your custom poses</Typography>
              <Box sx={{ display: "grid", gap: 0.5, mt: 1 }}>
                {customPoses.map(p => (
                  <Box key={p.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px dashed", borderColor: "divider", borderRadius: 1, p: 1 }}>
                    <Typography variant="body2">{p.label} · <span style={{ color: "#777" }}>{p.id}</span></Typography>
                    <Button size="small" color="error" onClick={()=>deleteCustomPose(p.id)}>Delete</Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setAddPoseOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveNewPose}>Save pose</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={2400} onClose={()=>setToast("")} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="info" onClose={()=>setToast("")} sx={{ width: "100%" }}>{toast}</Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
