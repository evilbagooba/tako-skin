# slides

Render a path through an idea graph as slides.

Hand it a project file (exported from the graph tool, or any file in the
[`core`](https://github.com/evilbagooba/core) format) and pick one of its
paths: each stop becomes a slide. It is a **compiler, not an author**:

- Every line on a slide is copied from the project: the node's title and
  subtitle, finished work outcomes (verbatim), evidence nodes wired to the
  stop, artifacts, and the labelled connections to other stops. Nothing is
  summarised or paraphrased.
- Each slide carries the ids its content came from; press **S** to show
  them.
- A stop with no evidence is marked **untested** and listed in the
  pre-flight check, never filled in.
- The node's notes are the speaker notes; open work items are listed under
  them.

`test/compile.test.ts` holds the compiler to this: on every core fixture,
every string a slide shows must appear verbatim in the project, and every
source id must exist.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

No server: the file is read in the browser and never uploaded. Present with
**Present ▶** (full screen; ← → or click to move, Esc to stop), or **Print /
PDF** for one slide per page.

## Develop

```sh
npm run typecheck
npm test           # compiler contract tests against core's fixtures
```

`core` is pinned by tag in `package.json`; bump the tag to pick up a new
format version.
