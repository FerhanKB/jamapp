import { useRef, useState, useEffect } from "react";
import { usePlayer } from "../player/usePlayer";
import { useJam } from "../jam/useJam";
import { effectiveQueue, requestSkip } from "../jam/session";

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar() {
  const { track, playing, position, duration, loading, error, volume, queue, history, player } =
    usePlayer();
  const jam = useJam();
  const [queueOpen, setQueueOpen] = useState(false);
  const queueRef = useRef<HTMLDivElement | null>(null);

  const inJam = jam !== null;
  const isGuest =
    jam !== null && jam.hostId !== "" && jam.youId !== "" && jam.hostId !== jam.youId;

  // In a jam, the queue everyone sees is the host's.
  const visibleQueue = inJam ? effectiveQueue() : queue;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (queueRef.current && !queueRef.current.contains(e.target as Node)) {
        setQueueOpen(false);
      }
    }
    if (queueOpen) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [queueOpen]);

  if (!track) return null;

  const seekPct = duration > 0 ? (position / duration) * 100 : 0;

  // Transport disabled for guests, EXCEPT for skip which is forwarded.
  const playPauseDisabled = isGuest;
  const playPauseTitle = isGuest ? "Only the host can play/pause" : undefined;
  const seekDisabled = isGuest || !isFinite(duration) || duration === 0;

  const onSkip = () => {
    if (isGuest) requestSkip();
    else void player.next();
  };

  const onPrev = () => {
    if (isGuest) return;
    void player.previous();
  };

  return (
    <footer className="now-playing">
      <div className="np-left">
        <img src={track.cover} alt="" />
        <div className="meta">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
      </div>

      <div className="np-center">
        <div className="transport">
          <button
            onClick={onPrev}
            disabled={isGuest || (history.length === 0 && position <= 3)}
            title={isGuest ? "Only the host can go back" : "Previous"}
          >
            ⏮
          </button>
          <button
            onClick={() => player.toggle()}
            disabled={playPauseDisabled || loading}
            title={playPauseTitle ?? (playing ? "Pause" : "Play")}
            className="play-btn"
          >
            {loading ? "…" : playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={onSkip}
            disabled={visibleQueue.length === 0}
            title={
              isGuest
                ? "Ask host to skip"
                : "Next"
            }
          >
            ⏭
          </button>
        </div>
        <div className="seek-row">
          <span className="time">{fmtTime(position)}</span>
          <input
            className="seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={position}
            onChange={(e) => player.seek(Number(e.currentTarget.value))}
            disabled={seekDisabled}
            title={isGuest ? "Only the host can seek" : undefined}
          />
          <span className="time">{fmtTime(duration)}</span>
        </div>
      </div>

      <div className="np-right">
        <div className="add-wrap" ref={queueRef}>
          <button
            onClick={() => setQueueOpen((v) => !v)}
            title="Up next"
            className="queue-btn"
          >
            Queue
            {visibleQueue.length > 0 && (
              <span className="badge">{visibleQueue.length}</span>
            )}
          </button>
          {queueOpen && (
            <div className="queue-panel">
              <div className="queue-header">
                <strong>Up next</strong>
                {!isGuest && visibleQueue.length > 0 && (
                  <button className="link" onClick={() => player.clearQueue()}>
                    Clear
                  </button>
                )}
              </div>
              {visibleQueue.length === 0 ? (
                <p className="hint" style={{ padding: "0.5rem 0.75rem", margin: 0 }}>
                  Queue is empty.
                </p>
              ) : (
                <ul>
                  {visibleQueue.map((t, i) => (
                    <li key={`${t.source}:${t.source_id}:${i}`}>
                      <img src={t.cover} alt="" />
                      <div className="meta">
                        <strong>{t.title}</strong>
                        <span>{t.artist}</span>
                      </div>
                      {!isGuest && (
                        <button
                          onClick={() => player.removeFromQueue(i)}
                          title="Remove"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="volume-row" title={`Volume ${Math.round(volume * 100)}%`}>
          <span className="vol-icon">
            {volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
          </span>
          <input
            className="volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => player.setVolume(Number(e.currentTarget.value))}
          />
        </div>
      </div>

      {error && <span className="error np-error">{error}</span>}
      <div
        className="seek-progress"
        style={{ width: `${seekPct}%` }}
        aria-hidden="true"
      />
    </footer>
  );
}
