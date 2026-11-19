# Monitoring

Two endpoints expose counters. Both need the bearer token when one is configured, and neither shows links, names or paths.

- `GET /api/stats` returns JSON: counts by status, total, combined speed, completed bytes, the speed limit and uptime.
- `GET /api/metrics` returns the same data in Prometheus text format (`wayfarer_downloads{status="…"}`, `wayfarer_speed_bytes_per_second`, `wayfarer_completed_bytes`, `wayfarer_bandwidth_limit_bytes_per_second`, `wayfarer_uptime_seconds`).

Prometheus scrape example:

```yaml
scrape_configs:
  - job_name: wayfarer
    metrics_path: /api/metrics
    authorization:
      credentials: <your WAYFARER_AUTH_TOKEN>
    static_configs:
      - targets: ['127.0.0.1:8787']
```

If you scrape through a reverse proxy, the `Host` must be listed in `WAYFARER_ALLOWED_HOSTS`.
