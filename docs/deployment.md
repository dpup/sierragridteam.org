# Deployment — sierragridteam.org

The site is a **fully static** Astro build (`dist/`). It is host-agnostic; the
configured target is **AWS S3 + CloudFront**, with DNS managed at **Hostinger**.

## One-time setup

> The AWS infra (bucket, CloudFront, OAC, ACM cert, deploy IAM user) is provisioned by a
> **separate Terraform project**. This doc only covers wiring the deploy + DNS.

### 1. AWS (provisioned via Terraform)

- **S3 bucket** (`sierragridteam.org-n01ckq`) for the static files. Block public
  access and serve via CloudFront with Origin Access Control (recommended), or
  enable static website hosting if you prefer.
- **CloudFront distribution** in front of the bucket:
  - Default root object: `index.html`.
  - **Clean-URL rewrite (required).** The build emits `live/index.html` /
    `about/index.html` (Astro `build.format: 'directory'`), but the site links to
    extensionless URLs like `/live`. An OAC (S3 REST) origin has no index-document logic,
    so without a rewrite every sub-page returns **403**. Attach a **CloudFront Function
    (viewer-request)** that resolves a directory / extensionless path to its `index.html`:

    ```js
    function handler(event) {
      var req = event.request;
      var uri = req.uri;
      if (uri.endsWith('/'))
        req.uri += 'index.html'; // /live/ -> /live/index.html
      else if (!uri.split('/').pop().includes('.')) req.uri += '/index.html'; // /live -> /live/index.html
      return req;
    }
    ```

    If you already run a viewer-request function (e.g. the apex-canonical redirect),
    fold this into it.

  - **Error pages.** A missing object on a private (OAC) origin returns **403**, not 404,
    so set CloudFront custom error responses for BOTH: **403 → `/403.html`** and **404 →
    `/404.html`**, each with **response code 404**. Both are the same on-brand not-found
    page (`/403.html` is a build-time copy of `/404.html` — see `astro.config.mjs`). They
    run _after_ the rewrite above, so real pages still resolve.
  - Attach an ACM certificate (us-east-1) for `sierragridteam.org` +
    `www.sierragridteam.org`.
  - Compress objects automatically (gzip/brotli).

- **IAM deploy user** — an IAM user with an access key, least-privilege:
  `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket and
  `cloudfront:CreateInvalidation` on the distribution. Export its access key +
  secret as GitHub secrets (below).

### 2. GitHub repo secrets / variables

Set under **Settings → Secrets and variables → Actions**. Following the
`dpup/ersn.net` convention, **only the access keys are Secrets**; the rest are
non-sensitive **Variables** (Terraform outputs all of them):

| Name                    | Kind         | Example                     |
| ----------------------- | ------------ | --------------------------- |
| `AWS_ACCESS_KEY_ID`     | **Secret**   | `AKIA…`                     |
| `AWS_SECRET_ACCESS_KEY` | **Secret**   | `…`                         |
| `AWS_REGION`            | **Variable** | `us-east-1`                 |
| `AWS_ACCOUNT_ID`        | **Variable** | `230964283885`              |
| `S3_BUCKET_NAME`        | **Variable** | `sierragridteam.org-n01ckq` |
| `CF_DISTRO_ID`          | **Variable** | `E2M7XGNO0BYU06`            |

The deploy job runs `sts get-caller-identity` and **aborts if the authenticated
account ≠ `AWS_ACCOUNT_ID`**, so a mis-scoped key can't push to the wrong account.

### 3. Hostinger DNS

Point the domain at CloudFront:

- `sierragridteam.org` → CloudFront (ALIAS/ANAME, or A/AAAA via Hostinger's
  CNAME-flattening at the apex) to `d3j7seetfd6zbh.cloudfront.net`.
- `www` → CNAME → `d3j7seetfd6zbh.cloudfront.net` (or redirect www→apex at CloudFront).

## How deploys run

- **Automatic (on merge):** `.github/workflows/deploy.yml` triggers when **CI**
  succeeds on `main`. It verifies the AWS account, builds, syncs `dist/` to S3
  (hashed assets cached immutably; HTML revalidated), then invalidates CloudFront.
- **Manual:** trigger the **Deploy** workflow via _Run workflow_, or deploy
  locally:
  ```sh
  make build
  aws s3 sync dist/ s3://sierragridteam.org-n01ckq --delete \
    --exclude "*.html" --cache-control "public,max-age=31536000,immutable"
  aws s3 sync dist/ s3://sierragridteam.org-n01ckq \
    --exclude "*" --include "*.html" --cache-control "public,max-age=0,must-revalidate"
  aws cloudfront create-invalidation --distribution-id E2M7XGNO0BYU06 --paths "/*"
  ```

## Data freshness

`/live` is rendered entirely in the browser from info.ersn.net (re-fetched every 90s);
nothing stale is baked in, and if the feed is unreachable it shows the official sources —
so its freshness is independent of deploys.

The home operational-status tiles and the site-wide emergency banner are server-rendered
from a build-time snapshot (`src/data/*.json`) and then upgraded by a client refresh on
load. Those checked-in JSON files are only the build-time / offline fallback — the CI
build fetches info.ersn.net live, so each deploy bakes a current one. `make snapshot`
refreshes the checked-in fallback (needs direct network; it can't run behind the Moat
proxy).
