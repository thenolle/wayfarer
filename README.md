# Wayfarer

A persistent, cross-platform background download manager.

Wayfarer is designed to manage downloads independently of individual browser
tabs or application windows, with persistent task tracking and reliable
download handling.

## Project status

Wayfarer is under active development and is not yet ready for production use.

Interfaces, configuration, and behaviour may change before the first stable
release.

## Goals

- Persistent download management.
- Reliable background processing.
- Concurrent download handling.
- Pause, resume, and retry support.
- Download progress and status tracking.
- Persistent task history.
- Configurable download behaviour.
- A clear interface for managing downloads.
- Cross-platform support.

## Technology

- [Bun](https://bun.sh/)
- [TypeScript](https://www.typescriptlang.org/)
- [SQLite](https://sqlite.org/)
- [Gambrel](https://github.com/thenolle/gambrel)

## Requirements

- Bun 1.4.4 or newer.
- Git.

## Getting started

Clone the repository:

```bash
git clone https://github.com/thenolle/wayfarer.git
cd wayfarer
```

Install dependencies:

```bash
bun install
```

Run the available quality checks:

```bash
bun run check
```

## Development

The project uses TypeScript with strict compiler settings.

The application is being developed around a separation of responsibilities:

- Application interface and HTTP API.
- Download scheduling and execution.
- Persistent storage and task history.
- Platform-specific background and filesystem integration.

Implementation details and supported platform requirements will be published
as they become part of the application.

## Contributing

Contributions, bug reports, and feature suggestions are welcome.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## Security

Do not report security vulnerabilities through public issues.

See [SECURITY.md](SECURITY.md) for the reporting process.

## License

The licensing terms have not yet been finalized. No permission to redistribute,
modify, or use this project is granted by the absence of a license file.
