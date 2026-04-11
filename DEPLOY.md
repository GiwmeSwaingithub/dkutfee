# 🚀 Quick Deployment Guide

## Method 1: Automated Script (Recommended)

```bash
cd dkut-vercel
./deploy.sh
```

The script will:
- Install dependencies
- Prompt for credentials
- Deploy to Vercel
- Guide you through environment variable setup

---

## Method 2: Manual Deployment

### Step 1: Change Your Password
**CRITICAL**: Go to https://portal.dkut.ac.ke and change your password immediately (it was shared publicly)

### Step 2: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 3: Login to Vercel
```bash
vercel login
```
Follow the browser prompt to authenticate.

### Step 4: Deploy
```bash
cd dkut-vercel
npm install
vercel --prod
```

Follow the prompts:
- **Set up and deploy?** Yes
- **Which scope?** Choose your account
- **Link to existing project?** No (first time) or Yes (updating)
- **Project name?** dkut-fee-scraper (or your choice)
- **Directory?** ./ (current directory)
- **Override settings?** No

### Step 5: Set Environment Variables

**Option A: Via Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Add:
   - Variable: `DKUT_EMAIL` | Value: `your-email@students.dkut.ac.ke`
   - Variable: `DKUT_PASSWORD` | Value: `your-NEW-password`
5. Select **Production** environment
6. Click **Save**

**Option B: Via CLI**
```bash
vercel env add DKUT_EMAIL production
# Enter: your-email@students.dkut.ac.ke

vercel env add DKUT_PASSWORD production
# Enter: your-NEW-password
```

### Step 6: Redeploy (after setting env vars)
```bash
vercel --prod
```

---

## 🌐 Accessing Your Site

After deployment, Vercel will show:
```
✅ Production: https://dkut-fee-scraper-xyz.vercel.app
```

Visit that URL to see your deployed site!

---

## 🧪 Testing

Test the API endpoints:
- **Health**: https://your-app.vercel.app/api/health
- **Fees**: https://your-app.vercel.app/api/fees

---

## 🔄 Updating Your Deployment

After making changes:
```bash
vercel --prod
```

---

## 🐛 Troubleshooting

**"Server configuration error"**
- Environment variables not set
- Add them via dashboard or CLI (Step 5)

**"Build failed"**
- Check build logs in Vercel dashboard
- Ensure package.json is present

**"Function timeout"**
- Vercel free tier: 10s limit
- Pro tier: 60s limit
- If scraping takes too long, upgrade plan

**Deployment not approved**
- The Vercel integration needs your approval
- Use manual deployment method above

---

## 📞 Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Support**: https://vercel.com/support
- **DKUT Portal**: studentadmin@dkut.ac.ke

---

**Ready to deploy? Run `./deploy.sh` or follow the manual steps above!**
