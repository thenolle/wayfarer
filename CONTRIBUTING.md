# Contributing to Wayfarer

Thank you for your interest in Wayfarer.

## Licensing of contributions

Wayfarer is released under the PolyForm Strict License 1.0.0, which does not
permit distributing or modifying the software. By submitting a contribution you
confirm that you wrote it or have the right to submit it, and you agree that
the project owner may include it in Wayfarer under the project's license.

## Before you start

- Check existing issues and pull requests.
- Open an issue before starting a substantial change.
- Keep pull requests focused. Avoid unrelated formatting or structural changes.
- Do not add dependencies without a clear technical reason. Runtime
  dependencies are limited to Gambrel packages.

## Development setup

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
```

## Quality checks

Run before submitting:

```bash
bun run check
```

This runs strict type checking and the test suite. Both must pass.

## Code conventions

- TypeScript strict mode. No `any`, `@ts-ignore` or unchecked assertions.
- Explicit types at public boundaries; discriminated unions for domain states.
- Prefer native Bun and Web APIs.
- Keep modules small and single-purpose. Preserve the boundaries described in
  `docs/architecture/overview.md`.
- Server-only code (database, filesystem, networking, configuration) must never
  be imported from browser code.
- Add tests that verify behaviour and invariants for every change.

## Pull requests

A pull request should explain the problem, describe the solution, link related
issues and list how it was verified.

## Reporting bugs

Use the bug report template. Include reproduction steps, expected and actual
behaviour, and your environment.
