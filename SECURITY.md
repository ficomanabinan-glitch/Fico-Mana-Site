# Security reporting

FICO MANA handles student/client photographs, bookings, payments and private delivery links. Do not report vulnerabilities in public issues with customer records, credentials, raw request bodies, screenshots of private portals, or working bearer URLs.

Contact the studio owner through the established private business channel and request a secure reporting method. Include the affected route, impact, approximate time, a redacted request ID and a minimal reproduction using synthetic records. A dedicated reporting mailbox and response SLA have not been verified; do not assume one exists.

Do not test against other clients, send unsolicited email, upload malware, run destructive database scripts, or alter production roles. Use a separately authorized test environment. Source changes do not prove live deployment or ISO certification.

Maintainers: use [the release checklist](docs/security/SECURE-DEPLOYMENT.md), [incident procedure](docs/security/INCIDENT-RESPONSE.md) and [audit register](docs/security/HARDENING-AUDIT.md). Rotate a compromised credential; removing a file does not remove copies in Git history, logs or clones.
