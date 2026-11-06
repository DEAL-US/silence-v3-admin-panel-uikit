# Silence admin panel

The admin panel of [Silence](https://github.com/IISSI-US/silence-py) 3: a web app that
administers a Silence project through its admin API (`/_silence/v1`, see
`docs/admin-api.md` in Silence). Plain HTML, CSS and JavaScript modules, with
[ez-ui](https://github.com/IISSI-US/ez-ui) and its own stylesheet; no framework, no build.

## How it reaches the projects

`silence new` copies the `admin/` folder of this repo into the new project (unless
`--no-admin` is given), and `silence admin update` replaces it with the latest version.
Silence serves the project's `admin/` folder at `/admin/`. Only `admin/` is copied: the rest
of this repo is for developing it.

`admin/panel.json` has the version of the panel and the version of the admin API that it
needs (`api`); Silence warns when they do not match.

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
page.

To try `silence new` with a local copy of this repo (and of the templates) instead of
GitHub, set `SILENCE_SOURCES` to the folder that contains them.
