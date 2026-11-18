# Supported hosts

A resolver turns the link you paste into the real file location. Wayfarer includes these.

| Host        | Links                                     | Notes                                                     |
| ----------- | ----------------------------------------- | --------------------------------------------------------- |
| Any website | Any `http` or `https` link to a file      | The fallback.                                             |
| Buzzheavier | `buzzheavier.com`, `bzzhr.to`, `bzzhr.co` | Follows the landing page and takes the file name from it. |
| MediaFire   | `mediafire.com` file pages                | Folders are not supported.                                |
| DataNodes   | `datanodes.to` file pages                 | Needs a browser; see below.                               |

> [!NOTE]
> The Buzzheavier and MediaFire resolvers were tested against simulated pages, not the live services, whose markup can change.

## Hosts that need a browser

Some hosts put a CAPTCHA or a Cloudflare challenge in front of the download. Wayfarer never solves or bypasses these. It tells you so instead of saving an HTML page as a file.

To download from such a host:

1. Open the link in your browser and finish the check.
2. Start the download there and copy the final download link (in Firefox: right-click the entry in the downloads panel and choose **Copy Download Link**).
3. Add that link to Wayfarer straight away. Signed links often expire quickly.

Links that depend on browser cookies may still be refused.

## Test a link first

Paste a link and wait for the link check. It runs the same resolver and probe as a download, so a link that cannot work shows its error before you add it.

To see exactly which request fails for a Buzzheavier page, run:

```bash
bun scripts/trace-resolver.ts [https://bzzhr.to/](https://bzzhr.to/)
```

It prints status codes and a few diagnostic headers for each of the three requests, and no page content.
