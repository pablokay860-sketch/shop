# Jack's Brand — Backend

Node.js/Express backend handling M-Pesa STK Push payments via Safaricom's Daraja API.

---

## Deploy to Railway in 5 steps

### 1. Get your Daraja credentials
1. Go to [https://developer.safaricom.co.ke](https://developer.safaricom.co.ke) and create a free account.
2. Create a new app — select **Lipa Na M-Pesa Sandbox** (for testing).
3. Note down your **Consumer Key**, **Consumer Secret**, and **Lipa Na M-Pesa Online Passkey**.
4. The sandbox **Shortcode** is `174379`.

---

### 2. Push this project to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/jacksbrand-backend.git
git push -u origin main
```

---

### 3. Create a Railway project
1. Go to [https://railway.app](https://railway.app) and sign up (free).
2. Click **New Project → Deploy from GitHub repo**.
3. Select your `jacksbrand-backend` repo.
4. Railway auto-detects the `Dockerfile` and starts building.

---

### 4. Set environment variables on Railway
In your Railway project dashboard, go to **Variables** and add these:

| Variable | Value |
|---|---|
| `PORT` | `4000` |
| `MPESA_ENV` | `sandbox` (change to `production` after Safaricom approves you) |
| `MPESA_CONSUMER_KEY` | from Daraja dashboard |
| `MPESA_CONSUMER_SECRET` | from Daraja dashboard |
| `MPESA_SHORTCODE` | `174379` (sandbox) |
| `MPESA_PASSKEY` | from Daraja dashboard |
| `MPESA_ACCOUNT_PREFIX` | `JacksBrand` |
| `BASE_URL` | your Railway public URL, e.g. `https://jacksbrand-api.up.railway.app` |

> ⚠️ Railway gives you the public URL under **Settings → Domains** after the first deploy.
> Set `BASE_URL` to that URL — Safaricom needs it to send payment callbacks back to you.

---

### 5. Update the storefront
Open `jacks-brand.html` and change the `API_BASE_URL` near the bottom of the `<script>` tag:

```js
// Before (local testing):
const API_BASE_URL = 'http://localhost:4000';

// After (production):
const API_BASE_URL = 'https://jacksbrand-api.up.railway.app';
```

---

## Running locally for testing

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and fill in your sandbox credentials
cp .env.example .env
# (edit .env with your values)

# 3. Expose your local server so Safaricom can reach the callback endpoint.
#    Install ngrok: https://ngrok.com, then:
ngrok http 4000
# Copy the https URL ngrok gives you and set it as BASE_URL in .env

# 4. Start the server
npm run dev

# 5. Open jacks-brand.html in a browser and test a purchase
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/checkout` | Starts M-Pesa STK Push; returns `orderRef` |
| `POST` | `/api/mpesa/callback` | Receives payment result from Safaricom (automatic) |
| `GET` | `/api/orders/:orderRef` | Polls current payment status |
| `GET` | `/health` | Health check (used by Railway) |

---

## Going live (production)
1. Apply for **Go-Live** on the Daraja developer portal — Safaricom reviews your app.
2. Once approved, swap all sandbox credentials for production ones in Railway's Variables tab.
3. Change `MPESA_ENV` to `production`.
4. Change `MPESA_SHORTCODE` to your actual Paybill or Till number.

---

## Project structure
```
jacksbrand-backend/
├── server.js          # Express app & API routes
├── mpesa.js           # Daraja API helper (token, STK push, query)
├── db.js              # SQLite order store
├── jacks-brand.html   # The storefront (open in browser)
├── Dockerfile         # Container build
├── railway.toml       # Railway deployment config
├── .env.example       # Environment variable template
├── .gitignore
└── package.json
```
