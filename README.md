# tako-skin — slides

Render a path through an idea graph as slides. Part of the
[tako](https://github.com/evilbagooba/tako) suite, and usable on its own.

Open a project from the tako hub, or hand it any tako file, and pick one of
its paths: each stop becomes a slide. It is a **compiler, not an author**:

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

`test/compile.test.ts` holds the compiler to this: on every tako fixture,
every string a slide shows must appear verbatim in the project, and every
source id must exist.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

**With the hub running** (`tako`, from the tako repo), the start screen
lists the hub's projects, and an open deck stays live: it recompiles when
another tool changes the project. `?hub=<url>` overrides the hub address
(`http://localhost:4100`); `?project=<id>` opens a project directly.
**Without the hub**, open a file: it is read in the browser and never
uploaded. This tool only reads; it never changes a project. Present with
**Present ▶** (full screen; ← → or click to move, Esc to stop), or **Print /
PDF** for one slide per page.

## Develop

```sh
npm run typecheck
npm test           # compiler contract tests against tako's fixtures
```

`tako` is pinned by tag in `package.json`; bump the tag to pick up a new
format version.
