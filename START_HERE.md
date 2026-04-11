# 🚀 DEPLOY TO VERCEL - START HERE

## ⚠️ CRITICAL FIRST STEP

**Your password was shared publicly. Before ANYTHING else:**

1. Go to https://portal.dkut.ac.ke
2. Click "Forgot Password?" or login and change password
3. Use a strong, unique password
4. **Never share credentials again**

---

## 📦 What You Have

Your Vercel-ready project with:
- ✅ Serverless API functions (`/api/fees.js`, `/api/health.js`)
- ✅ Modern HTML/CSS/JS frontend
- ✅ Vercel configuration (`vercel.json`)
- ✅ Automated deployment script

---

## 🎯 Deployment Options

### Option 1: Automated (Easiest)

```bash
# Extract the archive
tar -xzf dkut-vercel.tar.gz
cd dkut-vercel

# Run the deployment script
./deploy.sh
```

The script will guide you through everything!

---

### Option 2: Manual (3 Simple Steps)

**Step 1: Install Vercel CLI**
```bash
npm install -g vercel
```

**Step 2: Deploy**
```bash
# Extract and navigate
tar -xzf dkut-vercel.tar.gz
cd dkut-vercel

# Install dependencies
npm install

# Login to Vercel
vercel login

# Deploy!
vercel --prod
```

Answer the prompts:
- Set up and deploy? → **Yes**
- Which scope? → **Your account**
- Link to existing project? → **No** (first time)
- Project name? → **dkut-fee-scraper**
- Directory? → **./
**
- Override settings? → **No**

**Step 3: Add Environment Variables**

Go to https://vercel.com/dashboard
1. Click your project
2. Settings → Environment Variables
3. Add:
   - `DKUT_EMAIL` = your-email@students.dkut.ac.ke
   - `DKUT_PASSWORD` = your-NEW-password
4. Check "Production"
5. Save

Then redeploy:
```bash
vercel --prod
```

---

## ✅ Success Checklist

After deployment, verify:
- [ ] Site is live at https://your-project.vercel.app
- [ ] `/api/health` returns `{"status": "ok"}`
- [ ] `/api/fees` returns fee data
- [ ] Environment variables are set
- [ ] You changed your DKUT password

---

## 🌐 Your URLs

After deployment, you'll get:
- **Website**: https://dkut-fee-scraper-[random].vercel.app
- **API Health**: https://dkut-fee-scraper-[random].vercel.app/api/health
- **API Fees**: https://dkut-fee-scraper-[random].vercel.app/api/fees

---

## 🎨 Project Structure

```
dkut-vercel/
├── api/                  # Serverless functions
│   ├── fees.js          # Scrapes fee structure
│   └── health.js        # Health check
├── public/              # Frontend
│   ├── index.html       # Main page
│   ├── styles.css       # Styling
│   └── script.js        # API calls
├── vercel.json          # Deployment config
├── package.json         # Dependencies
└── deploy.sh            # Auto-deploy script
```

---

## 🔄 Updating Later

To update your deployed site:
```bash
cd dkut-vercel
# Make your changes
vercel --prod
```

---

## 🐛 Common Issues

**"No approval received"**
- The automated deployment needs your approval
- Use manual method instead (Option 2)

**"Server configuration error" on the site**
- Environment variables not set
- Follow Step 3 in manual deployment

**"Build failed"**
- Check build logs in Vercel dashboard
- Ensure all files are present

**Site loads but no data**
- Environment variables might be wrong
- Check Vercel → Settings → Environment Variables
- Verify credentials are correct

---

## 📞 Get Help

- **Vercel Issues**: https://vercel.com/docs
- **DKUT Portal**: studentadmin@dkut.ac.ke
- **Check Logs**: Vercel Dashboard → Your Project → Logs

---

## 🎯 Quick Start Commands

```bash
# Extract
tar -xzf dkut-vercel.tar.gz

# Deploy automatically
cd dkut-vercel && ./deploy.sh

# OR deploy manually
cd dkut-vercel
npm install
vercel login
vercel --prod
```

---

**Ready? Extract the archive and run `./deploy.sh`!** 🚀
