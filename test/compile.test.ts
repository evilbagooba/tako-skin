// Contract tests: compile every path in every tako fixture, and hold the
// compiler to the suite's source-only rule.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { migrateProject, type Project } from "tako";
import { compileDeck, type Slide } from "../src/compile";

const dir = dirname(fileURLToPath(import.meta.resolve("tako/fixtures/sourdough.json")));
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f, project: migrateProject(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), "Imported") }));

/** Every string a slide shows (not ids or structural fields). */
function shownText(s: Slide): string[] {
  if (s.kind === "title") return [s.title, s.subtitle];
  return [
    s.node.title,
    s.node.subtitle,
    s.notes,
    ...s.evidence.flatMap((e) => [e.text, e.from]),
    ...s.artifacts.map((a) => a.title),
    ...s.connections.flatMap((c) => [c.label, c.other]),
    ...s.openWork.map((w) => w.title),
  ].filter(Boolean);
}

function sourceExists(p: Project, source: string): boolean {
  if (source === "project") return true;
  const [kind, id] = source.split(":") as [string, string];
  const list = { node: p.nodes, work: p.work, edge: p.edges, artifact: p.artifacts, narrative: p.narratives }[kind];
  return !!list?.some((x) => x.id === id);
}

describe("compileDeck on tako fixtures", () => {
  it("has fixtures with paths to compile", () => {
    assert.ok(fixtures.some((f) => f.project.narratives.length > 0));
  });

  for (const { name, project } of fixtures) {
    for (const n of project.narratives) {
      describe(`${name} · ${n.name}`, () => {
        const deck = compileDeck(project, n.id);
        const doc = JSON.stringify(project);

        it("renders one slide per stop, plus a title slide", () => {
          assert.equal(deck.slides.length, n.nodeIds.length + 1);
        });

        it("source-only: every shown string is verbatim project content", () => {
          for (const s of deck.slides) {
            for (const text of shownText(s)) {
              assert.ok(doc.includes(JSON.stringify(text).slice(1, -1)), `“${text}” is not in the project`);
            }
          }
        });

        it("traceability: every source points at something in the project", () => {
          for (const s of deck.slides) for (const src of s.sources) assert.ok(sourceExists(project, src), src);
        });

        it("flags every untested stop in pre-flight", () => {
          const untested = deck.slides.filter((s) => s.kind === "stop" && s.status === "untested");
          const gaps = deck.preflight.filter((i) => i.level === "gap" && i.slideId);
          assert.equal(gaps.length, untested.length);
        });
      });
    }
  }
});

describe("compileDeck rules", () => {
  const sourdough = fixtures.find((f) => f.name === "sourdough.json")!.project;

  it("uses done outcomes and wired evidence nodes as evidence, verbatim", () => {
    const deck = compileDeck(sourdough, "n-friend");
    const proof = deck.slides.find((s) => s.kind === "stop" && s.node.id === "proof");
    assert.ok(proof && proof.kind === "stop");
    assert.equal(proof.status, "supported");
    assert.equal(proof.evidence[0]!.text, sourdough.work.find((w) => w.id === "w1")!.outcome);
    const temp = deck.slides.find((s) => s.kind === "stop" && s.node.id === "temp");
    assert.ok(temp && temp.kind === "stop" && temp.evidence.some((e) => e.source === "node:evidence"));
  });

  it("leaves stops without evidence untested, with open work in the notes", () => {
    const deck = compileDeck(sourdough, "n-open");
    const starter = deck.slides.find((s) => s.kind === "stop" && s.node.id === "starter");
    assert.ok(starter && starter.kind === "stop");
    assert.equal(starter.status, "untested");
    assert.deepEqual(starter.evidence, []);
    assert.equal(starter.openWork.length, 1);
  });

  it("only lists connections between stops of this path", () => {
    const deck = compileDeck(sourdough, "n-friend");
    for (const s of deck.slides) {
      if (s.kind !== "stop") continue;
      for (const c of s.connections) assert.ok(c.otherStop >= 1 && c.otherStop <= deck.slides.length - 1);
    }
  });

  it("doesn't flag a stop that is itself evidence", () => {
    const deck = compileDeck(sourdough, "n-friend");
    const ev = deck.slides.find((s) => s.kind === "stop" && s.node.id === "evidence");
    assert.ok(ev && ev.kind === "stop");
    assert.equal(ev.status, "evidence");
    assert.ok(!deck.preflight.some((i) => i.slideId === ev.id));
  });

  it("rejects an unknown path", () => {
    assert.throws(() => compileDeck(sourdough, "nope"), /No path/);
  });
});
