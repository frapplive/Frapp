#!/usr/bin/env bash
#
# Where the desktop app's releases are kept (#4843, ADR-29 decision 8): one
# private bucket in the production project. The `Desktop release` workflow
# writes to it, and installed apps read it only through the API's
# `GET /v1/desktop/updates/:file`, which redirects to a time-limited link.
#
# Run it once in Cloud Shell, signed in as an owner of the frapp.live
# organization, after scripts/gcp/bootstrap.sh:
#
#   bash scripts/gcp/desktop-downloads.sh <prod-project-id>
#
# It is safe to run again: every step looks for what it would create first.
#
# Production only. The desktop app has one update address, and staging's API
# answers 503 on that route because nothing here grants it anything.
#
# The bucket stays private, which is what the organization requires
# (`storage.publicAccessPrevention`, docs/ops/deployment/google-cloud.md), so
# this needs no exception to any organization policy, no load balancer change
# and no DNS record. Three grants do the work:
#
#   - `frapp-deployer` (what GitHub Actions signs in as) may write objects in
#     this bucket only;
#   - `frapp-api-runtime` (what the API runs as) may read objects in this
#     bucket only;
#   - `frapp-api-runtime` may sign as itself, which is how the API makes a
#     time-limited link with no key file (IAM Credentials `signBlob`).

set -euo pipefail

# shellcheck source=scripts/gcp/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  echo "usage: bash scripts/gcp/desktop-downloads.sh <prod-project-id>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
PROJECT_ID="$1"
REGION="$GCP_PRODUCTION_REGION"
BUCKET="gs://$DESKTOP_RELEASES_BUCKET"
RUNTIME_SA="frapp-api-runtime@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOYER_SA="frapp-deployer@$PROJECT_ID.iam.gserviceaccount.com"

step "Checking project $PROJECT_ID"
PROJECT_NAME="$(gcloud projects describe "$PROJECT_ID" --format='value(name)')"
require_project_for_environment production "$PROJECT_ID" "$PROJECT_NAME"
for account in "$RUNTIME_SA" "$DEPLOYER_SA"; do
  if ! exists iam service-accounts describe "$account"; then
    echo "There is no $account yet. Run scripts/gcp/bootstrap.sh for production first." >&2
    exit 1
  fi
done

step "Turning on Cloud Storage and IAM Credentials"
gc services enable storage.googleapis.com iamcredentials.googleapis.com

step "Private bucket $BUCKET in $REGION"
if ! exists storage buckets describe "$BUCKET"; then
  gc storage buckets create "$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
fi

step "A release may write here: $DEPLOYER_SA"
gc storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:$DEPLOYER_SA" --role=roles/storage.objectAdmin >/dev/null

step "The API may read here, and sign its own links: $RUNTIME_SA"
gc storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectViewer >/dev/null
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/iam.serviceAccountTokenCreator >/dev/null

step "Done. Paste this block back into the chat (none of it is secret):"
cat <<DONE
bucket:           $BUCKET
location:         $(gc storage buckets describe "$BUCKET" --format='value(location)')
writer:           $DEPLOYER_SA
readerAndSigner:  $RUNTIME_SA
DONE
