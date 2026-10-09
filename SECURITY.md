# Security Policy

PG Insight stores credentials for other people's databases and runs user-submitted SQL against them, so security reports are taken seriously.

## Reporting a vulnerability

Report privately through GitHub: **Security → Report a vulnerability** on this repository. Please do not open a public issue or pull request containing an exploit.

Include the affected endpoint or file, steps to reproduce, and the impact you observed. Test only against your own account and your own databases; do not access other users' data on the hosted instance.

## Scope

Especially relevant:

- Reading or changing another user's targets, alerts, metrics or backups
- Reaching internal addresses through target registration (SSRF)
- Writing to a monitored database, or bypassing the time limit, through `POST /live/:targetId/queries/explain`
- Bypassing authentication or rate limits on sign-up and login
- Recovering stored target passwords

## Supported versions

Only the latest commit on `master` (the version running at https://pginsight.javohir.dev) receives fixes.
