# Content

All authored text lives here.

```
content/
├── blog/        Blog posts (markdown). Linkbait + technique deep dives.
├── guides/      50 technique guides (one md file per technique).
└── i18n/        UI strings + variant landing copy, per locale.
    ├── en/
    ├── de/
    ├── es/
    ├── fr/
    ├── it/
    └── pt/
```

## Authoring

- All long-form content authored in English first under `blog/` or `guides/`.
- UI strings live in `i18n/<lang>/ui.json`; landing copy in `i18n/<lang>/<variant>.md`.
- Translations go through machine MT + a light human edit pass.

Phase 5 (Weeks 14–17) is when this directory fills up.
