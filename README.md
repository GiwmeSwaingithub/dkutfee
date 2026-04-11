# DKUT Fee Scraper - Vercel Deployment

This project is deployed on Vercel with serverless functions.

## 🚀 Deployment Structure

```
dkut-vercel/
├── api/                    # Serverless functions
│   ├── fees.js            # Main scraping API
│   └── health.js          # Health check
├── public/                # Static frontend
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── vercel.json            # Vercel configuration
└── package.json           # Dependencies
```

## 🔐 Setting Environment Variables

After deployment, you **must** set these environment variables in Vercel:

### Via Vercel Dashboard:
1. Go to your project on vercel.com
2. Click **Settings** → **Environment Variables**
3. Add these variables:
   - `DKUT_EMAIL` = your-email@students.dkut.ac.ke
   - `DKUT_PASSWORD` = your-NEW-secure-password

### Via Vercel CLI:
```bash
vercel env add DKUT_EMAIL
# Enter value: your-email@students.dkut.ac.ke

vercel env add DKUT_PASSWORD
# Enter value: your-password
```

Then redeploy:
```bash
vercel --prod
```

## 📡 API Endpoints

Once deployed, your API will be available at:

- **Fee Structure**: `https://your-app.vercel.app/api/fees`
- **Health Check**: `https://your-app.vercel.app/api/health`

## ⚠️ CRITICAL: Before Deploying

1. **Change your DKUT password** (it was shared publicly)
2. **Contact DKUT** for permission: studentadmin@dkut.ac.ke
3. Set environment variables (credentials)
4. Test locally first: `vercel dev`

## 🧪 Local Testing

```bash
# Install Vercel CLI
npm i -g vercel

# Install dependencies
npm install

# Set environment variables locally
vercel env pull .env.local

# Run locally
vercel dev

# Visit http://localhost:3000
```

## 🔒 Security Notes

- **Never commit .env files**
- Environment variables are encrypted in Vercel
- Serverless functions are stateless
- Session caching uses in-memory storage (30 min TTL)
- For production, consider Vercel KV for persistent sessions

## 📊 Monitoring

Check your deployment:
- **Logs**: Vercel Dashboard → Deployments → [Your deployment] → Function Logs
- **Analytics**: Dashboard → Analytics
- **Build Logs**: Dashboard → Deployments → Build Logs

## 🐛 Troubleshooting

**"Server configuration error"**
- Environment variables not set
- Go to Settings → Environment Variables

**"Authentication failed"**
- Wrong credentials
- Password may have changed
- Update environment variables

**Build fails**
- Check build logs in Vercel dashboard
- Ensure package.json has correct dependencies

**API timeout (10s limit)**
- Vercel free tier has 10s timeout
- Scraping might be too slow
- Consider upgrading or optimizing

## 🔄 Updating the Deployment

```bash
# Make changes locally
# Test with: vercel dev

# Deploy to production
vercel --prod
```

## 📞 Support

- Vercel Issues: vercel.com/support
- DKUT Portal: studentadmin@dkut.ac.ke

---

**Deployed with ❤️ on Vercel**
