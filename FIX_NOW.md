# 🔧 One Step Fix — Edit deploy.yml on GitHub

## Problem
Workflow runs but Pages still serves from branch (legacy mode = empty keys).

## Fix: Update deploy.yml content

**Click here to edit:**
https://github.com/abhishekagrahari307-max/ITR-AND-GST/edit/arena/019fabf8-itr-and-gst/.github/workflows/deploy.yml

**Select ALL text (Ctrl+A) and replace with content from WORKFLOW_TO_CREATE.yml**

The new workflow:
- Has `contents: write` permission
- After injecting keys, COMMITS config-generated.js back to the branch
- So Pages (legacy mode) serves files WITH the real API keys

## After editing, workflow will:
1. Run build.js → reads GEMINI_API_KEY from GitHub Secret ✅
2. Commit config-generated.js (with real key) to branch ✅  
3. Pages serves branch files → config-generated.js with key loads → AI works! ✅
