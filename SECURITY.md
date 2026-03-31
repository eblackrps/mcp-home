# Security Notes

This project is meant to run against local home infrastructure, so a public clone should still be treated carefully.

## Keep out of version control

Do not commit:

- `.env` or any other file containing live API keys, bearer tokens, or OAuth passwords
- generated host snapshots under `data/local/`
- audit logs under `logs/`
- OAuth registration or token state under `state/`

## Before making the repository public

- rotate any secrets that were ever used while developing locally
- verify the tracked sample data and notes contain only public-safe content
- make sure your public deployment only exposes read-only tools unless you have a stronger auth model in place

## Reporting

For non-sensitive bugs, open a normal GitHub issue.

For anything involving secret exposure, authentication bypass, or risky host access, use GitHub private vulnerability reporting if it is enabled for the repository, or contact the maintainer privately through GitHub before opening a public issue.
