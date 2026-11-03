# AI provider keys and deployment safety

TaxMitra is published as a static site on GitHub Pages. **A key placed in frontend code, HTML, build output, or browser storage is visible to that browser's user.** GitHub Actions secrets do not make a key safe once a workflow publishes it as a public JavaScript asset.

## Recommended setup

- For local/personal use, add your own provider key in the app's AI setup page. The key stays in your browser storage, but the browser sends it directly to the selected provider when you use that AI feature. Treat it as exposed to your browser and review the provider's current pricing and privacy terms.
- Never put provider keys into GitHub repository secrets for this static frontend. The current build script ignores such variables; an older workflow may still pass them to the build environment, so maintainers should remove those environment bindings and unused secrets when updating repository workflow permissions.
- For a shared production service, use a separately hosted server-side proxy with authentication, rate limits, abuse monitoring, and provider keys stored only on that server. GitHub Pages alone cannot keep a shared key secret.

Provider documentation:

- Gemini: <https://aistudio.google.com/app/apikey>
- OpenRouter: <https://openrouter.ai/keys>

## GitHub Pages deployment

1. In repository **Settings → Pages**, set the source to **GitHub Actions**.
2. Changes merged into `main` trigger `.github/workflows/deploy.yml`; you can also run it with **Actions → Deploy TaxMitra to GitHub Pages → Run workflow**.
3. The workflow creates public build metadata only, uploads the static site, and deploys it. It does not inject or publish AI provider keys.

No Income Tax or GST government portal credentials are used. TaxMitra does not file returns, submit forms, or fetch portal records.
