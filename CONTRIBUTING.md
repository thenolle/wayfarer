# Contributing to Wayfarer

Contributions are welcome. Please keep changes focused, maintainable, and
consistent with the existing project structure.

## Before contributing

- Check existing issues and pull requests.
- For substantial changes, open an issue before starting implementation.
- Avoid unrelated changes in the same pull request.
- Do not introduce dependencies without a clear technical reason.

## Development environment

Requirements:

- Bun 1.4.4 or newer.
- Git.

Clone the repository and install dependencies:

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
bun install
```

## **Quality checks**
Before submitting changes, run:

>_Shell1 line

```
bun run check
```

```
bun run check
```

All TypeScript checks must pass.

## **Pull requests**
A pull request should:

- Explain the problem being addressed.
- Describe the implementation.
- Identify any relevant issues.
- Include verification steps.
- Avoid unrelated formatting or structural changes.
Keep pull requests focused and reasonably small.

## **Code conventions**

- Use TypeScript strict mode.
- Prefer explicit types at public boundaries.
- Keep modules focused on a single responsibility.
- Avoid unnecessary dependencies.
- Handle errors explicitly.
- Avoid leaking platform-specific behaviour into shared modules.
- Preserve existing architectural boundaries.

## **Reporting bugs**
Use the repository's bug report issue template.

Include reproduction steps, expected behaviour, actual behaviour, and relevant
environment details.
