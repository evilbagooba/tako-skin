// The slides compiler: project + narrative → deck. A compiler, not an
// author: every piece of content on a slide is copied from the project and
// carries the id it came from (`source`). Nothing is summarised, paraphrased
// or filled in. A stop with no evidence is shown as untested, and listed in
// the pre-flight check, rather than padded with plausible text.
//
// Pure and framework-free, so it's tested against tako's fixture projects.

import type { Narrative, Project, ProjectNode } from "tako/model";

/** Where a piece of content came from: "node:<id>", "work:<id>",
 * "edge:<id>", "artifact:<id>", "narrative:<id>", "project". */
export type Source = string;

export type Evidence = {
  /** The author's own words, verbatim: a work item's outcome, or an
   * evidence node's title. */
  text: string;
  /** What produced it: the work item's title, or the evidence node's subtitle. */
  from: string;
  link: string;
  source: Source;
};

export type Artifact = { title: string; link: string; isImage: boolean; source: Source };

export type Connection = {
  /** The edge's label, as written ("" when unlabelled). */
  label: string;
  direction: "out" | "in";
  /** The other stop's title and its position in the path (1-based). */
  other: string;
  otherStop: number;
  source: Source;
};

export type TitleSlide = {
  kind: "title";
  id: string;
  title: string;
  subtitle: string;
  stops: number;
  sources: Source[];
};

export type StopSlide = {
  kind: "stop";
  id: string;
  /** 1-based position in the path. */
  stop: number;
  node: { id: string; title: string; subtitle: string; color: string; emoji: string; image: string; shape: ProjectNode["shape"] };
  /** evidence: the stop is itself an evidence node. */
  status: "supported" | "untested" | "evidence";
  evidence: Evidence[];
  artifacts: Artifact[];
  connections: Connection[];
  /** Speaker notes: the node's notes, verbatim, plus work still open. */
  notes: string;
  openWork: { title: string; status: string; source: Source }[];
  sources: Source[];
};

export type Slide = TitleSlide | StopSlide;

export type Issue = {
  level: "gap" | "info";
  message: string;
  /** Slide this issue points at, if any. */
  slideId: string | null;
};

export type Deck = { title: string; narrative: Narrative; slides: Slide[]; preflight: Issue[] };

const IMAGE_LINK = /^(https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?|data:image\/)/i;
const name = (s: string, fallback: string) => s.trim() || fallback;

export function compileDeck(project: Project, narrativeId: string): Deck {
  const narrative = project.narratives.find((n) => n.id === narrativeId);
  if (!narrative) throw new Error(`No path with id "${narrativeId}" in this project.`);

  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const stops = narrative.nodeIds.filter((id) => byId.has(id));
  const stopIndex = new Map(stops.map((id, i) => [id, i + 1]));

  const slides: Slide[] = [
    {
      kind: "title",
      id: "title",
      title: name(project.title, "Untitled graph"),
      subtitle: name(narrative.name, "Untitled path"),
      stops: stops.length,
      sources: ["project", `narrative:${narrative.id}`],
    },
  ];
  const preflight: Issue[] = [];

  if (stops.length === 0) {
    preflight.push({ level: "gap", message: "This path has no stops yet. Add some in the graph's Path mode.", slideId: null });
  }
  const missing = narrative.nodeIds.length - stops.length;
  if (missing > 0) {
    preflight.push({ level: "info", message: `${missing} stop${missing === 1 ? " points" : "s point"} at nodes that no longer exist and ${missing === 1 ? "is" : "are"} skipped.`, slideId: null });
  }

  for (const id of stops) {
    const n = byId.get(id)!;
    const stop = stopIndex.get(id)!;
    const slideId = `stop-${id}`;
    const work = project.work.filter((w) => w.nodeId === id);

    const evidence: Evidence[] = [];
    for (const w of work) {
      if (w.status === "done" && w.outcome.trim()) {
        evidence.push({ text: w.outcome.trim(), from: name(w.title, "Work item"), link: w.link, source: `work:${w.id}` });
      }
    }
    // Evidence nodes wired to this stop count as evidence: their title is
    // the finding, in the author's words.
    for (const e of project.edges) {
      const otherId = e.to === id ? e.from : e.from === id ? e.to : null;
      if (!otherId) continue;
      const other = byId.get(otherId);
      if (other?.kind !== "evidence") continue;
      evidence.push({ text: name(other.title, "Evidence"), from: other.subtitle.trim(), link: "", source: `node:${other.id}` });
    }

    const workIds = new Set(work.map((w) => w.id));
    const artifacts: Artifact[] = project.artifacts
      .filter((a) => a.nodeId === id || (a.workId !== null && workIds.has(a.workId)))
      .map((a) => ({ title: name(a.title, "Artifact"), link: a.link, isImage: IMAGE_LINK.test(a.link), source: `artifact:${a.id}` }));

    const connections: Connection[] = [];
    for (const e of project.edges) {
      const out = e.from === id;
      if (!out && e.to !== id) continue;
      const otherId = out ? e.to : e.from;
      const otherStop = stopIndex.get(otherId);
      if (!otherStop) continue; // only connections within the story
      connections.push({
        label: e.label.trim(),
        direction: out ? "out" : "in",
        other: name(byId.get(otherId)!.title, "Untitled"),
        otherStop,
        source: `edge:${e.id}`,
      });
    }
    connections.sort((a, b) => a.otherStop - b.otherStop);

    const openWork = work
      .filter((w) => w.status !== "done")
      .map((w) => ({ title: name(w.title, "Work item"), status: w.status, source: `work:${w.id}` }));

    const status = n.kind === "evidence" ? "evidence" : evidence.length ? "supported" : "untested";
    const title = name(n.title, "Untitled");
    if (status === "untested") {
      preflight.push({ level: "gap", message: `Stop ${stop}, “${title}”, has no evidence yet and will show as untested.`, slideId });
    }

    slides.push({
      kind: "stop",
      id: slideId,
      stop,
      node: { id, title, subtitle: n.subtitle.trim(), color: n.color, emoji: n.emoji, image: n.image, shape: n.shape },
      status,
      evidence,
      artifacts,
      connections,
      notes: n.body.trim(),
      openWork,
      sources: [
        `node:${id}`,
        ...evidence.map((x) => x.source),
        ...artifacts.map((x) => x.source),
        ...connections.map((x) => x.source),
      ],
    });
  }

  return { title: name(project.title, "Untitled graph"), narrative, slides, preflight };
}
