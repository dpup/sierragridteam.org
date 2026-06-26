# Deployment — sierragridteam.org

The site is a **fully static** Astro build (`dist/`). It is host-agnostic; the
configured target is **AWS S3 + CloudFront**, with DNS managed at **Hostinger**.

## One-time setup

> The AWS infra (bucket, CloudFront, OAC, ACM cert, deploy IAM user) is provisioned by a
> **separate Terraform project**. This doc only covers wiring the deploy + DNS.

### 1. AWS (provisioned via Terraform)

- **S3 bucket** (e.g. `sierragridteam.org`) for the static files. Block public
  access and serve via CloudFront with Origin Access Control (recommended), or
  enable static website hosting if you prefer.
- **CloudFront distribution** in front of the bucket:
  - Default root object: `index.html`.
  - **Custom error response:** map 403/404 → `/404.html` (status 404) so clean
    URLs and the on-brand 404 page work.
  - Attach an ACM certificate (us-east-1) for `sierragridteam.org` +
    `www.sierragridteam.org`.
  - Compress objects automatically (gzip/brotli).
- **IAM deploy user** — an IAM user with an access key, least-privilege:
  `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket and
  `cloudfront:CreateInvalidation` on the distribution. Export its access key +
  secret as GitHub secrets (below).

### 2. GitHub repo secrets / variables

Set under **Settings → Secrets and variables → Actions**:

Set all of these as **Secrets** (Terraform outputs the values):

| Secret                       | Example              |
| ---------------------------- | -------------------- |
| `AWS_ACCESS_KEY_ID`          | `AKIA…`              |
| `AWS_SECRET_ACCESS_KEY`      | `…`                  |
| `AWS_REGION`                 | `us-west-2`          |
| `AWS_ACCOUNT_ID`             | `123456789012`       |
| `S3_BUCKET`                  | `sierragridteam.org` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1ABCDEF…`          |

The deploy job runs `sts get-caller-identity` and **aborts if the authenticated
account ≠ `AWS_ACCOUNT_ID`**, so a mis-scoped key can't push to the wrong account.

### 3. Hostinger DNS

Point the domain at CloudFront:

- `sierragridteam.org` → CloudFront (ALIAS/ANAME, or A/AAAA via Hostinger's
  CNAME-flattening at the apex) to `dXXXX.cloudfront.net`.
- `www` → CNAME → `dXXXX.cloudfront.net` (or redirect www→apex at CloudFront).

## How deploys run

- **Automatic (on merge):** `.github/workflows/deploy.yml` triggers when **CI**
  succeeds on `main`. It verifies the AWS account, builds, syncs `dist/` to S3
  (hashed assets cached immutably; HTML revalidated), then invalidates CloudFront.
- **Manual:** trigger the **Deploy** workflow via _Run workflow_, or deploy
  locally:
  ```sh
  make build
  aws s3 sync dist/ s3://sierragridteam.org --delete \
    --exclude "*.html" --cache-control "public,max-age=31536000,immutable"
  aws s3 sync dist/ s3://sierragridteam.org \
    --exclude "*" --include "*.html" --cache-control "public,max-age=0,must-revalidate"
  aws cloudfront create-invalidation --distribution-id EXXXX --paths "/*"
  ```

## Data freshness

The live data snapshot (`src/data/ersn-snapshot.json`) is baked at build time.
To refresh it between content deploys, run `make snapshot` and commit, or rely on
the browser's 5-minute client refresh (once info.ersn.net CORS lands — see FR-1
in `docs/architecture/data-feed.md`). Consider a scheduled rebuild (cron workflow)
if you want the SSR snapshot to stay current without manual commits.
