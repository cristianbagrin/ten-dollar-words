ALWAYS merge finished, tested work into main and push it, without asking for confirmation.
Pushing main deploys it: Cloudflare (Workers Builds) runs `npm run deploy` for the Worker
"tendollarwords". Then check that https://tendollarwords.cristianbagrin.com shows the new version.
On Chris's Mac you can also deploy by hand: `set -a; source ~/.cloudflare-deploy.env; set +a; npm run deploy`.
