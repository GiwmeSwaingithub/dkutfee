#!/bin/bash

echo "🚀 DKUT Fee Scraper - Vercel Deployment"
echo "========================================"
echo ""
echo "⚠️  IMPORTANT: Before deploying, you MUST:"
echo "1. Change your DKUT password (it was shared publicly)"
echo "2. Have Vercel CLI installed (npm i -g vercel)"
echo "3. Be logged into Vercel (vercel login)"
echo ""

read -p "Have you changed your password? (yes/no): " changed_password
if [ "$changed_password" != "yes" ]; then
    echo "❌ Please change your password first at https://portal.dkut.ac.ke"
    exit 1
fi

echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🔐 Setting environment variables..."
echo "You'll need to enter your DKUT credentials"
echo ""

read -p "Enter your DKUT email (e.g., name@students.dkut.ac.ke): " dkut_email
read -sp "Enter your NEW DKUT password: " dkut_password
echo ""

# Set environment variables for deployment
export DKUT_EMAIL="$dkut_email"
export DKUT_PASSWORD="$dkut_password"

echo ""
echo "🚀 Deploying to Vercel..."
echo ""

# Deploy to production
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Go to your Vercel dashboard"
    echo "2. Click on your project → Settings → Environment Variables"
    echo "3. Add these variables:"
    echo "   - DKUT_EMAIL = $dkut_email"
    echo "   - DKUT_PASSWORD = (your password)"
    echo "4. Redeploy if needed"
    echo ""
    echo "🌐 Your app should be live at the URL shown above!"
else
    echo ""
    echo "❌ Deployment failed. Check the errors above."
    echo ""
    echo "Manual deployment steps:"
    echo "1. Run: vercel login"
    echo "2. Run: vercel --prod"
    echo "3. Follow the prompts"
fi
