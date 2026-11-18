# Reverse proxy and TLS

Wayfarer speaks plain HTTP and sends the access token and session cookie in
clear text. Do not expose it beyond your own machine without TLS. Terminate TLS
in a reverse proxy and keep Wayfarer on loopback (or on the private Docker
network).

Requirements for any proxy:

- Forward the original `Host` header. Wayfarer rejects names that are not in
  `WAYFARER_ALLOWED_HOSTS` and checks that browser `Origin` headers match the
  host.
- Add your public name to `WAYFARER_ALLOWED_HOSTS`, for example
  `WAYFARER_ALLOWED_HOSTS=downloads.example.com`.
- Pass WebSocket upgrades on `/ws`, or live updates will not work (the dashboard
  still works through normal page loads and forms).
- Set `X-Forwarded-Proto: https` so session cookies are marked `Secure`.
- Set `WAYFARER_AUTH_TOKEN`. It is required whenever the service is not bound to
  loopback only.

## Caddy

```text
downloads.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy obtains certificates, forwards `Host`, upgrades WebSockets and sets
`X-Forwarded-Proto` by default.

## nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name downloads.example.com;

    # ssl_certificate and ssl_certificate_key go here

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;
        proxy_buffering off;
    }
}
```

`proxy_buffering off` lets large file downloads stream instead of being
buffered on the proxy.
