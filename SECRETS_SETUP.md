# 🔑 TaxMitra AI — API Keys Setup Guide
> Developer: Abhishek Agrahari | TaxMitra AI Enterprise

## How API Keys Work in This Project

```
User sets GitHub Secret
        ↓
GitHub Actions runs on push
        ↓
Workflow injects key into js/config-generated.js
        ↓
config-generated.js auto-loads key into localStorage
        ↓
AI functions read from localStorage → API calls work
```

## Step 1: Get Free API Keys

### Gemini API Key (Required for AI)
1. Go to: https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Key format: `AIzaSy...` (39 characters)
4. **Free tier: 1,500 requests/day**

### OpenRouter API Key (Optional — for DeepSeek + Llama)
1. Go to: https://openrouter.ai/keys
2. Create account → Generate API Key
3. Key format: `sk-or-...`
4. **Free tier: 50-1,000 requests/day**

## Step 2: Set GitHub Secrets

1. Go to your repo: https://github.com/abhishekagrahari307-max/ITR-AND-GST
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add these two secrets:

| Secret Name | Value |
|-------------|-------|
| `GEMINI_API_KEY` | `AIzaSy...` (your Gemini key) |
| `OPENROUTER_API_KEY` | `sk-or-...` (your OpenRouter key) |

## Step 3: Enable GitHub Actions for Pages

1. Go to: Settings → Pages
2. Set **Source** to: `GitHub Actions`
3. The workflow at `.github/workflows/deploy.yml` will now run automatically

## Step 4: Trigger Deployment

Push any commit to trigger the workflow:
```bash
git commit --allow-empty -m "trigger: deploy with API keys"
git push origin arena/019fabf8-itr-and-gst
```

## How It Works Internally

The workflow at `.github/workflows/deploy.yml`:
1. Checks out the code
2. Creates `js/config-generated.js` with real keys from GitHub Secrets
3. Injects `<script src="...config-generated.js">` into all HTML pages
4. Uploads to GitHub Pages

**Security: Keys are NEVER stored in git history. They only exist in:**
- GitHub Secrets (encrypted, not visible even to you in plain text)
- The deployed `config-generated.js` (not in git, regenerated each deploy)
- Browser `localStorage` (set by config-generated.js at page load)

## For Local Development

Set keys temporarily in browser console:
```javascript
TaxMitra.setKeys({
  geminiApiKey: 'AIzaSy...',
  openrouterApiKey: 'sk-or-...'
})
```

Then reload the page. Keys persist in localStorage until you clear browser data.

---
*Last updated: July 2026 | Developer: Abhishek Agrahari*
