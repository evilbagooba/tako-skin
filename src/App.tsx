import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { migrateProject, type Project } from "core";
import { compileDeck, type Deck, type Slide } from "./compile";

// Node fills, matching the graph tool, so a stop's dot looks like its node.
const COLORS: Record<string, string> = {
  ink: "#1b1b1b",
  paper: "#fafaf7",
  teal: "#dde5e1",
  vermilion: "#ff4d00",
  ochre: "#efe3bc",
  plum: "#e3dfe3",
  sage: "#dfe5d6",
  slate: "#dee1e4",
};

type Loaded = { project: Project; fileName: string };

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((text: string, fileName: string) => {
    try {
      const project = migrateProject(JSON.parse(text), fileName.replace(/\.json$/i, ""));
      setLoaded({ project, fileName });
      setError(null);
    } catch {
      setError(`“${fileName}” isn't a project file this version can read.`);
    }
  }, []);

  // Drop a file anywhere to open it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f) void f.text().then((t) => open(t, f.name));
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [open]);

  return loaded ? (
    <DeckScreen key={loaded.fileName} project={loaded.project} onClose={() => setLoaded(null)} />
  ) : (
    <OpenScreen error={error} onOpen={open} />
  );
}

function OpenScreen({ error, onOpen }: { error: string | null; onOpen: (text: string, name: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <main className="app paper" style={{ minBlockSize: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div style={{ maxInlineSize: "34rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <p className="label" style={{ margin: 0 }}>Slides</p>
          <h1 style={{ margin: "0.25rem 0 0", fontSize: "2rem", lineHeight: 1.1 }}>
            A talk, compiled from your graph
          </h1>
        </div>
        <p style={{ margin: 0, color: "var(--dim)", lineHeight: 1.5 }}>
          Open a project file exported from the graph tool, pick a path, and each stop becomes a
          slide. Nothing is written for you: every line on a slide comes from the file, and stops
          without evidence are shown as untested.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="Project file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void f.text().then((t) => onOpen(t, f.name));
            }}
          />
          <button type="button" className="btn" data-variant="primary" onClick={() => fileRef.current?.click()}>
            Open project file…
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const mod = await import("core/fixtures/sourdough.json");
              onOpen(JSON.stringify(mod.default), "Example: sourdough.json");
            }}
          >
            Try an example
          </button>
        </div>
        <p className="label" style={{ margin: 0 }}>or drop a .json file anywhere</p>
        {error && (
          <p role="alert" style={{ margin: 0, color: "var(--danger-text)" }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function DeckScreen({ project, onClose }: { project: Project; onClose: () => void }) {
  const [pathId, setPathId] = useState(() => project.narratives[0]?.id ?? "");
  const [index, setIndex] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const deck = useMemo<Deck | null>(() => (pathId ? compileDeck(project, pathId) : null), [project, pathId]);
  const slides = deck?.slides ?? [];
  const gapCount = deck?.preflight.filter((i) => i.level === "gap").length ?? 0;
  const current = slides[Math.min(index, slides.length - 1)];
  // Moving between slides is a view transition: the slide slides in the
  // direction of travel (a crossfade under reduced motion; see theme.css).
  // A new move during one finishes the old one first, so it never blocks.
  const indexRef = useRef(index);
  indexRef.current = index;
  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(i, slides.length - 1));
      if (next === indexRef.current) return;
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (!doc.startViewTransition) {
        setIndex(next);
        return;
      }
      document.documentElement.dataset.travel = next > indexRef.current ? "forward" : "back";
      doc.startViewTransition(() => flushSync(() => setIndex(next)));
    },
    [slides.length],
  );

  useEffect(() => setIndex(0), [pathId]);
  // Keep the current thumbnail in view (the rail scrolls; on phones it's a
  // horizontal strip).
  useEffect(() => {
    document
      .querySelector('.thumb[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, select, textarea")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
      else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) setShowSources((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, slides.length, presenting]);

  // Full screen while presenting, when the browser allows it.
  useEffect(() => {
    if (!presenting) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return;
    }
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [presenting]);

  if (project.narratives.length === 0) {
    return (
      <main className="app paper" style={{ minBlockSize: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
        <div className="island" style={{ maxInlineSize: "28rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{project.title || "Untitled graph"} has no paths yet</h1>
          <p style={{ margin: 0, color: "var(--dim)", lineHeight: 1.5 }}>
            A deck is a path through the graph. In the graph tool, open Paths, make a path by tapping
            nodes in the order you'd tell the story, then export the project again.
          </p>
          <div>
            <button type="button" className="btn" onClick={onClose}>
              Open another file
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="app paper" style={{ minBlockSize: "100dvh", display: "flex", flexDirection: "column" }}>
        <header
          className="island"
          style={{ margin: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem", flexWrap: "wrap" }}
        >
          <button type="button" className="btn" data-variant="ghost" onClick={onClose} aria-label="Close file">
            ←
          </button>
          <h1 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, marginInlineEnd: "auto", minInlineSize: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.title || "Untitled graph"}
          </h1>
          <label className="sr-only" htmlFor="path">
            Path
          </label>
          <select id="path" className="select" value={pathId} onChange={(e) => setPathId(e.target.value)}>
            {project.narratives.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name || "Untitled path"} · {n.nodeIds.length} stops
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            data-variant="ghost"
            aria-pressed={showSources}
            title="Show where each slide's content comes from (S)"
            onClick={() => setShowSources((v) => !v)}
          >
            Sources
          </button>
          <button type="button" className="btn" data-variant="ghost" onClick={() => window.print()}>
            Print / PDF
          </button>
          <button type="button" className="btn" data-variant="primary" onClick={() => setPresenting(true)} disabled={!slides.length}>
            Present ▶
          </button>
        </header>

        <div className="deck-layout">
          <aside className="island deck-rail">
            {deck && deck.preflight.length > 0 && (
              <section aria-label="Pre-flight check" style={{ padding: "0.75rem", borderBlockEnd: "1px solid var(--border)" }}>
                <h2 className="label" style={{ margin: "0 0 0.5rem" }}>
                  Pre-flight · {gapCount} {gapCount === 1 ? "gap" : "gaps"}
                </h2>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem", fontSize: "0.8125rem" }}>
                  {deck.preflight.map((i, k) => (
                    <li key={k}>
                      {i.slideId ? (
                        <button
                          type="button"
                          onClick={() => go(slides.findIndex((s) => s.id === i.slideId))}
                          style={{ all: "unset", cursor: "pointer", color: i.level === "gap" ? "var(--danger-text)" : "var(--dim)" }}
                        >
                          {i.message}
                        </button>
                      ) : (
                        <span style={{ color: "var(--dim)" }}>{i.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <ol aria-label="Slides" className="thumbs">
              {slides.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className="thumb" aria-current={s === current} onClick={() => go(i)} style={{ inlineSize: "100%" }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--dim)", paddingBlockStart: 2 }}>
                      {i + 1}
                    </span>
                    <SlideView slide={s} total={slides.length - 1} showSources={false} />
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <main className="deck-main">
            {current && (
              <SlideView slide={current} total={slides.length - 1} showSources={showSources} live={!presenting} />
            )}
            {current?.kind === "stop" && (
              <section className="island" aria-label="Speaker notes" style={{ padding: "0.75rem 1rem" }}>
                <h2 className="label" style={{ margin: "0 0 0.375rem" }}>Speaker notes</h2>
                {current.notes ? (
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "0.9375rem" }}>{current.notes}</p>
                ) : (
                  <p style={{ margin: 0, color: "var(--dim)", fontSize: "0.875rem" }}>This node has no notes.</p>
                )}
                {current.openWork.length > 0 && (
                  <p style={{ margin: "0.5rem 0 0", color: "var(--dim)", fontSize: "0.875rem" }}>
                    Still open: {current.openWork.map((w) => `${w.title} (${w.status === "doing" ? "in progress" : "to do"})`).join("; ")}
                  </p>
                )}
              </section>
            )}
            <p className="label" style={{ margin: 0, textAlign: "center" }}>
              <span className="keys-hint">← → to move · S sources · </span>
              {index + 1} / {slides.length}
            </p>
          </main>
        </div>
      </div>

      {presenting && current && (
        <Stage onClose={() => setPresenting(false)} onNext={() => go(index + 1)} onBack={() => go(index - 1)}>
          <SlideView slide={current} total={slides.length - 1} showSources={showSources} live />
          <p className="stage-hint">
            {index + 1} / {slides.length}
            <span className="keys-hint"> · ← → · Esc to stop</span>
          </p>
        </Stage>
      )}

      <div className="print-deck" aria-hidden>
        {slides.map((s) => (
          <SlideView key={s.id} slide={s} total={slides.length - 1} showSources={showSources} />
        ))}
      </div>
    </>
  );
}

function SlideView({
  slide,
  total,
  showSources,
  live = false,
}: {
  slide: Slide;
  total: number;
  showSources: boolean;
  /** The one slide on screen that view transitions animate (names must be unique). */
  live?: boolean;
}) {
  const live_ = live ? " slide-live" : "";
  if (slide.kind === "title") {
    return (
      <article className={`slide slide-title-slide${live_}`} aria-label={`Title slide: ${slide.title}`}>
        <div className="slide-inner">
          <p className="slide-kicker" style={{ margin: 0 }}>
            {slide.stops} {slide.stops === 1 ? "stop" : "stops"}
          </p>
          <h2 className="slide-title">{slide.title}</h2>
          <p className="slide-subtitle">{slide.subtitle}</p>
        </div>
        {showSources && <p className="slide-sources">{slide.sources.join(" · ")}</p>}
      </article>
    );
  }
  const n = slide.node;
  const images = slide.artifacts.filter((a) => a.isImage);
  const links = slide.artifacts.filter((a) => !a.isImage);
  return (
    <article className={`slide${live_}`} aria-label={`Stop ${slide.stop}: ${n.title}`}>
      <div className="slide-inner">
        <p className="slide-kicker" style={{ margin: 0 }}>
          <span
            aria-hidden
            className="slide-dot"
            style={{ background: n.shape === "circle" ? COLORS[n.color] ?? COLORS.paper : "var(--surface)" }}
          >
            {n.shape === "emoji" ? n.emoji : n.shape === "image" && n.image ? <img src={n.image} alt="" /> : null}
          </span>
          Stop {slide.stop} of {total}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2cqi" }}>
          <h2 className="slide-title">{n.title}</h2>
          {n.subtitle && <p className="slide-subtitle">{n.subtitle}</p>}
        </div>
        <span className="slide-status" data-status={slide.status}>
          {slide.status === "supported" ? "Supported" : slide.status === "evidence" ? "Evidence" : "Untested"}
        </span>
        {slide.status === "evidence" ? null : slide.evidence.length > 0 ? (
          <ul className="slide-evidence">
            {slide.evidence.map((e) => (
              <li key={e.source}>
                <figure style={{ margin: 0 }}>
                  <blockquote>{e.text}</blockquote>
                  {(e.from || e.link) && (
                    <figcaption>
                      {e.from}
                      {e.link && /^https?:\/\//.test(e.link) && (
                        <>
                          {e.from && " · "}
                          <a href={e.link} target="_blank" rel="noreferrer noopener">
                            link
                          </a>
                        </>
                      )}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        ) : (
          <p className="slide-untested">No evidence recorded for this yet.</p>
        )}
        {images.length > 0 && (
          <div className="slide-artifacts">
            {images.map((a) => (
              <ArtifactImage key={a.source} title={a.title} link={a.link} />
            ))}
          </div>
        )}
        {(slide.connections.length > 0 || links.length > 0) && (
          <div className="slide-foot">
            {slide.connections.map((c) => (
              <span key={c.source}>
                {c.direction === "out" ? "→" : "←"} {c.label && <>{c.label} </>}
                <strong>{c.other}</strong> ({c.otherStop})
              </span>
            ))}
            {links.map((a) => (
              <span key={a.source}>
                ↗{" "}
                {/^https?:\/\//.test(a.link) ? (
                  <a href={a.link} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>
                    {a.title}
                  </a>
                ) : (
                  a.title
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      {showSources && <p className="slide-sources">{slide.sources.join(" · ")}</p>}
    </article>
  );
}

/** An image artifact; a link that doesn't load falls back to its title as a
 * link, rather than a broken-image box on the slide. */
function ArtifactImage({ title, link }: { title: string; link: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure>
      {failed ? (
        <a href={link} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>
          ↗ {title} (image didn't load)
        </a>
      ) : (
        <>
          <img src={link} alt={title} onError={() => setFailed(true)} />
          <figcaption>{title}</figcaption>
        </>
      )}
    </figure>
  );
}

/** Presenting: a native modal <dialog> (top layer, focus kept inside, Esc
 * closes it natively). Pointer: swipe left/right to move, judged on offset
 * or flick velocity; a tap on the left third goes back, elsewhere forward. */
function Stage({
  onClose,
  onNext,
  onBack,
  children,
}: {
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="stage"
      aria-label="Presenting"
      onClose={onClose}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || (e.target as HTMLElement).closest("a, button")) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        const v = Math.abs(dx) / Math.max(1, e.timeStamp - s.t); // px per ms
        const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
        if (horizontal && (Math.abs(dx) > 80 || (Math.abs(dx) > 24 && v > 0.5))) {
          if (dx < 0) onNext();
          else onBack();
        } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          if (e.clientX < window.innerWidth / 3) onBack();
          else onNext();
        }
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {children}
    </dialog>
  );
}
