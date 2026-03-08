# GC Suite - LAN / Multi-device Setup (Quick Notes)

## 1) Start API (host PC)
From `apps/api`:
- Copy `.env.example` -> `.env` and fill `DATABASE_URL` + `JWT_SECRET`
- Ensure:
  - `HOST=0.0.0.0`
  - `PORT=3005`

Run:
- `npm run dev` (or whatever script you use)

## 2) Start Web (host PC)
From `apps/web`:
- Copy `.env.example` -> `.env`
- Set:
  - `NEXT_PUBLIC_API_URL=http://<PC-LAN-IP>:3005`
  - `API_BASE_URL=http://<PC-LAN-IP>:3005`

Run:
- `npm run dev -- -H 0.0.0.0 -p 3002`

## 3) Windows Firewall
Allow inbound TCP:
- 3002 (web)
- 3005 (api)

## 4) Open from another device
- `http://<PC-LAN-IP>:3002`
