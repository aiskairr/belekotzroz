# WAHA runtime for Ordo CRM

Docker is required. WAHA runs on port `3001`, because Ordo CRM uses `3000`.

## 1. Install Docker Desktop

Install Docker Desktop for macOS, open it once, and wait until Docker is running.

Check:

```bash
docker --version
```

## 2. Download WAHA

```bash
cd /Users/aminhan/Desktop/mysrs/waha-runtime
docker pull devlikeapro/waha
```

## 3. Generate WAHA credentials

```bash
docker run --rm -v "$(pwd)":/app/env devlikeapro/waha init-waha /app/env
```

After this command, WAHA creates `waha-runtime/.env`.

Copy the value of `WAHA_API_KEY` from `waha-runtime/.env` into:

```env
# /Users/aminhan/Desktop/mysrs/waha-backend/.env
WAHA_API_KEY=...
WAHA_URL=http://127.0.0.1:3001
```

## 4. Run WAHA

```bash
docker run -it --env-file "$(pwd)/.env" -v "$(pwd)/sessions:/app/.sessions" --rm -p 3001:3000 --name waha devlikeapro/waha
```

Dashboard:

```text
http://localhost:3001/dashboard
```

## 5. Connect phone

In Ordo CRM open `WhatsApp рассылка` and click `Подключить QR`.

On phone:

```text
WhatsApp -> Settings -> Linked devices -> Link a device
```

Scan the QR code. When the session status becomes `WORKING`, messages can be sent through WAHA.
