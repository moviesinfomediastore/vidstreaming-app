# Vidstreaming – Pay-Per-View Video Platform

A premium video streaming platform where viewers pay a one-time fee to unlock full video content via PayPal.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: ShadCN/UI + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Storage + Edge Functions)
- **Payments**: PayPal REST API
- **Deployment**: Cloudflare Pages

## Getting Started

```sh
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create a `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
```

## Supabase Secrets

Set these in your Supabase project dashboard under Edge Function secrets:

- `ADMIN_PASSWORD` – Admin panel login password
- `PAYPAL_CLIENT_ID` – PayPal API client ID
- `PAYPAL_SECRET` – PayPal API secret
- `PAYPAL_API` – `https://api-m.sandbox.paypal.com` (sandbox) or `https://api-m.paypal.com` (live)
- `PAYPAL_CURRENCY` – Currency code (default: `USD`)

## Deployment (Cloudflare Pages)

1. Push your code to a GitHub repository
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repo
4. Set build command: `npm run build`
5. Set output directory: `dist`
6. Add the environment variables listed above
7. Deploy!
