# Using the dashboard

The dashboard works without JavaScript. With JavaScript it adds live progress, link checks, shortcuts and a few conveniences.

## Add downloads

Paste up to 50 links, one per line, into **Add downloads**.

- **Link check.** With a single link, Wayfarer contacts the host, as a real download would, and shows the file name, size and whether it can resume. It runs half a second after you stop typing, or when you press **Check link**. If the host needs a browser, the reason appears before you add anything.
- **File name.** Filled in from the check. Edit it to rename the file. This works for a single link only.
- **Save to.** The main download folder, or a location you named in `WAYFARER_LOCATIONS`. Add a **Subfolder** such as `Games/PC` (at most four levels; `..` is refused).
- **More options.** Priority from -100 to 100, and a SHA-256 checksum for a single link.

## Find and sort

The sidebar filters by status and shows counts. The search box matches names and links. Sort by status, newest first, name, size, progress or priority.

## Control downloads

Each card shows progress, size, speed and time left. Buttons depend on the status: pause, resume, retry, cancel, **Download file** and, on your own machine, **Show in folder**. **More** holds priority, removal and the full details.

Select several downloads with their checkboxes to pause, resume, cancel or remove them together (up to 200 at a time).

## Speed limit

Pick a preset (no limit, 1, 5 or 10 MiB/s) or type a custom value. The limit applies to all downloads together and survives restarts.

## Keyboard shortcuts

| Key | Action               |
| --- | -------------------- |
| `/` | Focus the search box |
| `N` | Focus the add box    |

## On a phone

The filters become a scrolling row, the speed limit folds into a panel and buttons grow to touch size.

> [!TIP]
> While downloads run, the browser tab title shows overall progress and speed.
