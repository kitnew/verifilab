# Deployment

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
docker compose exec app npm run db:seed
```

The app listens on port 3000. Startup runs `prisma migrate deploy`; seeding is explicit because it replaces project data and resets the demo admin password from `BOOTSTRAP_ADMIN_PASSWORD`. The named `verifilab-data` volume stores `/data/verifilab.db`.

Useful checks:

```bash
docker compose ps
curl http://localhost:3000/api/health
curl http://localhost:3000/api/meta
docker compose logs -f app
```

Back up the SQLite file from the stopped container volume before upgrades. This package is suitable for a single demo/small-instance deployment; it does not implement rolling upgrades or horizontal scale.
