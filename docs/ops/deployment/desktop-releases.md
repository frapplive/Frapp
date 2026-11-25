# Desktop releases

How the desktop app (`apps/desktop`, [ADR-29](../../../spec/architecture/adr/adr-29.md)) is signed, published and updated ([#4843](https://github.com/frapplive/Frapp/issues/4843)). The app itself is described in [`spec/architecture/README.md` § 3.4a](../../../spec/architecture/README.md#34a-desktop-appsdesktop).

> **Not yet run end to end (2026-11-25).** Everything here is built and unit-tested, and the pieces that could be checked without credentials were: packaging with nothing installed (Linux, in a clean copy), the link signature against Google's own client library, and every `gcloud` and electron-builder flag against the installed tools. No signed build, upload or update has happened yet, because the signing secrets and the bucket don't exist. The first `Desktop release` run is the first real test; correct this note when it has passed.

## How it fits together

```text
Desktop release (workflow_dispatch, main only)
  build     ubuntu, no secrets     npm ci, compile apps/desktop/dist
  sign      macOS + Windows        `automation` environment: package, sign, notarize, verify;
                                   installs only the pinned packaging tools (tools/desktop-release)
  publish   ubuntu                 `production` environment (Paul approves): upload, point beta

gs://frapp-live-downloads/desktop/        private bucket, production project
  Frapp-Setup-<v>.exe, Frapp-<v>-universal.dmg, Frapp-<v>-universal-mac.zip
  feeds/<v>/latest.yml, latest-mac.yml    that version's feeds, kept
  beta.yml, beta-mac.yml                  what apps on "Get Updates Early (Beta)" read
  latest.yml, latest-mac.yml              what every other app reads

installed app -> GET https://api.frapp.live/v1/desktop/updates/<file>
              -> 302 to a link into the bucket that works for one hour
```

- **Versions are plain** (`0.2.0`). A channel is a feed file, never a version suffix, so promoting a release moves a feed and rebuilds nothing.
- **The bucket is private**, as the organization requires ([`google-cloud.md`](google-cloud.md): no public buckets). The API signs each link as its own identity with no key file (`apps/api/src/infrastructure/google/gcs-signed-url.client.ts`), and only for a file the bucket holds: the route is public, so a name that merely looks right gets a 404 and costs no signature. The API re-reads the bucket's file list every minute, and ten seconds after a miss (`apps/api/src/application/services/desktop-update/desktop-update.service.ts`; name rules in `apps/api/src/domain/constants/desktop-updates.ts`).
- **Updates download whole files.** Partial downloads are off (`apps/desktop/src/main/updater.ts`), because each byte range would be its own trip through the redirect, so a release uploads no `.blockmap` files.
- **Only a signed release updates itself.** `apps/desktop/electron-builder.yml` sets `publish: null`; the `sign` job alone passes the update address, which electron-builder writes into the app as `app-update.yml`. A build without that file (a `Desktop build` artifact, a local `npm run dist`) never checks for updates, so an unsigned copy can't pull a release it would then fail to verify. Don't hand `Desktop build` installers to testers: they stay on that build forever.
- **The packaging tools are pinned.** The `sign` job holds the certificates, so it runs `npm ci --ignore-scripts` in `tools/desktop-release` (electron-builder and its whole tree, from that folder's own lockfile) and nothing from the repo's lockfile. Raise electron-builder there and in `apps/desktop/package.json` together. One piece is not pinned: electron-builder installs Microsoft's `TrustedSigning` PowerShell module at whatever version is newest ([#6082](https://github.com/frapplive/Frapp/issues/6082)).
- **An installed app never moves to an older version.** Pointing a channel back stops new installs of a bad release; installs that already took it stay until a higher version is published.
- **Staging has no desktop feed.** The app has one update address. Staging's API answers 503 on the route because nothing grants it the bucket.

## One-time setup

Owner-only. In a chat these are walked one at a time.

### 1. The bucket

In Cloud Shell, on `main`:

```bash
bash scripts/gcp/desktop-downloads.sh cs-project-nyit2x59
```

It makes the private bucket and three grants (the deployer writes, the API reads and signs), and ends with a `Done` block. Nothing in the API's configuration changes, but production must be running a build that has the route: run **Deploy production** on a commit at or after the one that added it.

To check: `curl -sI https://api.frapp.live/v1/desktop/updates/latest.yml` answers `302` with a `storage.googleapis.com` address in `location` once a release has been promoted; before that it answers `404`, as it does for any file the bucket doesn't hold. A `503` means the API could not read the bucket or sign; its log line `Desktop update link unavailable: <reason>` says why (`list_403` is the missing read grant, `sign_403` the missing sign-as-itself grant, `no_runtime_token` an API not on Cloud Run).

### 2. Signing secrets

All twelve are secrets of the **`automation`** GitHub environment (Settings, Environments, automation), which admits `main` only and has no reviewers ([`agent-infra.md` § GitHub environments and bootstrap secrets](../../ci-cd/agent-infra.md#github-environments-and-bootstrap-secrets)). They are GitHub secrets, not Infisical ones: only the `sign` job reads them. The job stops before packaging and names any that are missing.

| Secret | What it is |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | The **Developer ID Application** certificate with its private key, exported from Keychain Access as `.p12`, then base64 (`base64 -i cert.p12 \| pbcopy`) |
| `MAC_CERTIFICATE_PASSWORD` | The password set when exporting that `.p12` |
| `APPLE_API_KEY_P8` | The whole text of an App Store Connect API key file (`AuthKey_XXXX.p8`), for notarization. A team key with the Developer role is enough |
| `APPLE_API_KEY_ID` | That key's Key ID |
| `APPLE_API_ISSUER` | The Issuer ID shown above the keys list in App Store Connect |
| `AZURE_TENANT_ID` | The Microsoft Entra tenant of the app registration below |
| `AZURE_CLIENT_ID` | The app registration's Application (client) ID |
| `AZURE_CLIENT_SECRET` | A client secret of that app registration. It expires (two years at most); the Windows `sign` job fails with an Azure sign-in error when it has |
| `AZURE_SIGNING_ENDPOINT` | The Artifact Signing account's regional address, such as `https://eus.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | The Artifact Signing account's name |
| `AZURE_SIGNING_PROFILE` | The certificate profile's name |
| `AZURE_SIGNING_PUBLISHER_NAME` | The certificate's subject name, exactly as Azure shows it (Paul's legal name, his pick on 2026-11-24). It is written into the app, and an installed copy refuses an update signed under another name |

The app registration needs the **Artifact Signing Certificate Profile Signer** role on the certificate profile. Azure's identity validation must be complete before a certificate profile can be made.

> Changing the publisher name later (an individual certificate to a company one) needs one bridging release that lists both names in `publisherName`, signed under the old one, before any release signed under the new one. Without it every installed Windows copy refuses the update.

## Releasing a version

1. Raise `version` in `apps/desktop/package.json` in a PR and merge it. A version is published once: the workflow refuses one whose feeds are already in the bucket. It also refuses one that an earlier run left half uploaded (a `publish` job that died partway), because a second build is signed again and its files no longer match the ones already there. Either way the fix is the same: raise the version and release that.
2. Actions, **Desktop release**, Run workflow on `main`, action `release`.
3. `build` and `sign` need no click. The macOS job fails if Gatekeeper would reject the app (`spctl`, `stapler validate`); the Windows job fails unless the installer's signature is valid and its signer is exactly `AZURE_SIGNING_PUBLISHER_NAME`, the name installed copies will check. Both fail if the packaged app doesn't carry the update address.
4. Approve the `production` gate on `publish`. It uploads the files, keeps the version's feeds, and points **beta** at it. No ordinary install moves.
5. Try it: install the previous version, tick **Get Updates Early (Beta)** in the app's menu, and wait for "Frapp X is ready".

## Promoting, staging and pulling a release

All three are the same run: Actions, **Desktop release**, action `point`, then the `production` approval.

| Goal | channel | version | staging |
| --- | --- | --- | --- |
| Give a tested beta to everyone | `latest` | the version | blank |
| Give it to a share of installs first | `latest` | the version | a percent, such as `20`; run again with a higher number, then blank |
| Stop offering a bad release | the channel it is on | the version before it | blank |

A release that was promoted is on both channels: pull it from `latest` and from `beta`, one run each. A run reads and checks both of the version's feeds before it writes either, so Windows and Mac never end up on different versions.

## What is verified and what is not

- **Checked against the tools (2026-11-25):** `gcloud storage` flags and `CLOUDSDK_AUTH_ACCESS_TOKEN` (gcloud's own source); `azureSignOptions`, the `AZURE_*` sign-in variables, `CSC_LINK` and the `APPLE_API_*` notarization variables (electron-builder 26.18.1's source); the updater following redirects, reading `<channel>.yml`, and checking the Windows publisher (electron-updater 6.8.11's source); packaging from a checkout with no `node_modules`; `publish: null` leaving `app-update.yml` out and `-c.publish.provider=generic -c.publish.url=...` writing it; the link's signing text against `@google-cloud/storage`.
- **Derived, not run:** that GitHub's macOS and Windows runners carry `gh`, and its Ubuntu runner `gcloud`; `spctl` and `stapler` accepting the notarized app; the first sign-as-itself call on Cloud Run, and the bucket listing it makes first (`roles/storage.objectViewer` carries `storage.objects.list` per Google's role reference); the Windows signer's `SimpleName` equalling the certificate's subject name.
- **Reviewed once (2026-11-25):** five review agents read the change before its PR; their findings were fixed without a second, independent check of each.
