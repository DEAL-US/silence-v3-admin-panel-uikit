# Silence admin panel

The admin panel of [Silence](https://github.com/IISSI-US/silence-py) 3: a web app that
administers a Silence project through its admin API (`/_silence/v1`, see
`docs/admin-api.md` in Silence). Plain HTML, CSS and JavaScript modules, with
[UIkit](https://getuikit.com) (copied in `admin/vendor/uikit/`, MIT, no CDN) and its own
stylesheet (`admin/css/admin.css`, `sa-` prefix); no framework, no build.

It does not use ez-ui on purpose: ez-ui is what the students use (and customize) in their
own web apps, so the panel looks clearly different and gives them no ez-ui code.

## How it reaches the projects

`silence new` copies the `admin/` folder of this repo into the new project (unless
`--no-admin` is given), and `silence admin update` replaces it with the latest version.
Silence serves the project's `admin/` folder at `/admin/`. Only `admin/` is copied: the rest
of this repo is for developing it.

`admin/panel.json` has the version of the panel and the version of the admin API that it
needs (`api`); Silence warns when they do not match.

## Structure

- `admin/index.html`: the layout (sidebar, breadcrumbs, page, console); no modal windows.
- `admin/js/main.js`: the hash router (`#/tests/composite/edit/<name>`…), the breadcrumbs,
  the Back button (only in second-level pages: editors, try, password) and the watch of the
  project's `revision`.
- `admin/js/pages/`: one module per section (`render`, `crumbs` and `parent`).
- `admin/js/components/table.js`: the grid of every list, sortable by column and with a
  filter under each header.
- `admin/js/components/console.js`: the console at the bottom with the requests that the
  panel sends to the student's API (trying an endpoint, unit tests, composite tests), with the
  errors highlighted; kept in `sessionStorage`.
- Composite tests (sequences of unit tests, by name) belong only to the panel: it saves them
  through the admin API (`/panel-data/composite_tests`, that is, the project's
  `admin/data/composite_tests.json`; versioning it is the student's decision) and runs them
  step by step against the student's API, so they change the database.

## Development

This repo is also a small Silence project (`silence.json`, `sql/`), so the panel can be
developed in place:

```
mariadb -u iissi_user -p -e "CREATE DATABASE silence_panel_db"
mariadb -u iissi_user -p silence_panel_db < sql/create_tables.sql   # and the other scripts of sql/
silence run          # serves admin/ at http://127.0.0.1:8080/admin/
```

The database is the one of the CI of Silence (departments and employees; the passwords are
the part of the email before the `@`). The changes in `admin/` are seen when reloading the
page. What the panel saves meanwhile (`admin/data/`) is not versioned here.

To try `silence new` with a local copy of this repo (and of the templates) instead of
GitHub, set `SILENCE_SOURCES` to the folder that contains them.
