# Discovery Agent

An AI agent built for **Red Rock Technology**'s discovery process. It analyses short screen recordings from a
client's staff, finds the repetitive work worth automating, estimates what it costs, and gives Red Rock's
consultants a costed hypothesis and a targeted interview plan before the discovery session.

> *We find what people do, so your consultants can ask why.*

## Status

| Part | Folder | Status |
|---|---|---|
| Mock workplace (fake AP job at "Meridian Advisory LLC") | [`mock-workplace/`](mock-workplace/) | ✅ Done |
| Recorder (Chrome extension) | [`recorder/`](recorder/) | ✅ Built, needs a first real test in Chrome |
| Server: recording ingest + checking page | [`server/`](server/) | ✅ Built |
| Agent pipeline (local model via LM Studio) | [`server/pipeline/`](server/pipeline/) | ✅ Built; runs locally |
| Consultant dashboard | [`dashboard/`](dashboard/) | ✅ Built |

The full plan (architecture, data contracts, pipeline, team split, timeline, demo script) is in
[`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## Run the mock workplace

```bash
cd mock-workplace
npm install
npm run dev
```

Then open http://localhost:5173.

## Record a session

See [`recorder/README.md`](recorder/README.md): start the server, load the extension in Chrome, press Start.

## Analyse recordings (runs locally, nothing leaves the computer)

1. Install [LM Studio](https://lmstudio.ai), download a model that fits your memory (e.g. an 8B–12B model on a 16 GB Mac),
   load it with a context length of at least 8,000 tokens, and start the local server (Developer tab → Start server).
2. Run:

```bash
cd server
.venv/bin/python -m pipeline.run --sessions sara-02 lina-01 --estimate   # checks LM Studio, shows request sizes
.venv/bin/python -m pipeline.run --sessions sara-02 lina-01 --batch local-v1
```

Results go to `data/results/<batch>/`; finished stages are reused. Optional settings (`LLM_MODEL`, `LLM_VISION=1` for
models that can read screenshots) go in `server/.env`, see `server/pipeline/common.py`.

## Open the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Then open http://localhost:5174 (the server on :8000 must be running).
