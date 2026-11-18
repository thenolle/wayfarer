# Security Policy

Security is an important part of Wayfarer.

## Reporting a vulnerability

Do not disclose security vulnerabilities through public GitHub issues,
discussions, or pull requests.

Use GitHub's private vulnerability reporting:

https://github.com/thenolle/wayfarer/security/advisories/new

Include:

- A description of the vulnerability.
- The affected components or versions.
- Steps to reproduce the issue.
- Potential impact.
- Any relevant proof of concept.

Avoid including real credentials, personal information, or sensitive data in
reports.

## Supported versions

Wayfarer is currently under development. Security fixes will be prioritized
for the latest development version.

Supported release versions will be listed here once stable releases are
available.

## Known limitations

- **DNS rebinding.** Destination checks resolve a host name before each
  request and redirect hop, but the HTTP client resolves it again when it
  connects. A hostile DNS server could answer differently the second time.
  Do not point Wayfarer at hosts you do not trust on a network with sensitive
  internal services, and keep `WAYFARER_ALLOW_PRIVATE_NETWORKS` empty unless
  you need it.
- **Sign-in throttling is shared.** After repeated wrong tokens, sign-in is
  paused for everyone for a short time. Wayfarer is designed for one user or
  a small trusted group, so this favours safety over availability.
- **Inline style attributes.** The page policy allows `style` attributes
  (`style-src-attr 'unsafe-inline'`) because progress bars are positioned with
  them. Scripts and style sheets remain limited to the application's own files.
- **Show in folder** runs the system file manager and is available only when
  Wayfarer listens on a loopback address.
