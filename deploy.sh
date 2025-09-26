#!/bin/zsh

# Sync serverless mux files into repo root
rsync -a projects-app/api/ api/
rsync -a projects-app/api-lib/ api-lib/

# Deploy to production
vercel --prod

# Pin stable alias (replace with your team alias if needed)
vercel alias set $(vercel ls lucky-draw-app --prod 2>/dev/null | awk '/https:/{print $1; exit}') lucky-draw-app-debra-ls-projects.vercel.app