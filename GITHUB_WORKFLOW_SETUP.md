# 📋 GitHub Actions Workflow — Manual Setup Required

Because the Arena sandbox doesn't have workflow permissions, you need to 
**manually create** the GitHub Actions workflow file.

## Step 1: Create the workflow file

On GitHub.com:
1. Go to: `https://github.com/abhishekagrahari307-max/ITR-AND-GST`
2. Click **"Add file"** → **"Create new file"**
3. Type filename: `.github/workflows/deploy.yml`
4. Paste the content below:

```yaml
name: 🚀 TaxMitra AI — Build & Deploy
on:
  push:
    branches: [arena/019fabf8-itr-and-gst, main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build (inject API keys from secrets)
        run: node build.js
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_SHA: ${{ github.sha }}
          GITHUB_REF_NAME: ${{ github.ref_name }}
      
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Step 2: Set GitHub Secrets

1. Go to: `Settings` → `Secrets and variables` → `Actions`
2. Click **"New repository secret"**
3. Add:
   - `GEMINI_API_KEY` = `AIzaSy...` (from aistudio.google.com)
   - `OPENROUTER_API_KEY` = `sk-or-...` (from openrouter.ai/keys)

## Step 3: Update GitHub Pages Source

1. Go to: `Settings` → `Pages`
2. Change **Source** from `Deploy from a branch` to `GitHub Actions`

## Step 4: Trigger Deployment

After setting secrets, push any commit or go to:
`Actions` → `TaxMitra AI — Build & Deploy` → `Run workflow`

---
That's it! From now on, every push automatically:
1. Reads secrets securely
2. Injects keys via `build.js`
3. Deploys with AI working for all users
