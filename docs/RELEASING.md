# Releasing Pinchy

## Manual release

1. Update code and docs.
2. Bump `package.json` version.
3. Run validation:

```bash
npm run release:verify
```

4. Publish manually:

```bash
npm publish
```

If npm requires stronger publish authentication, use your configured token or publish flow.

`npm run release:verify` runs typecheck, the full test suite, dashboard build, `npm pack --dry-run`, and the packaged install smoke test. It forces a temporary npm cache so local machine cache ownership issues do not block release validation. Set `PINCHY_RELEASE_NPM_CACHE=/path/to/cache` only when you intentionally want a stable release-validation cache.

## Version branches and tags

Use release branches and tags that match the package version:

```bash
git switch -c release/0.3.0
npm version 0.3.0 --no-git-tag-version
npm run release:verify
git commit -am "Release 0.3.0"
git tag -a v0.3.0 -m "Release 0.3.0"
git push origin release/0.3.0
git push origin v0.3.0
```

The npm package version is the source of truth. Branch names are for review clarity; tags drive automated publishing.

## Automated release via GitHub Actions

This repository includes `.github/workflows/publish-npm.yml`.

It publishes when you push a version tag matching `v*`.

Example:

```bash
git tag v0.2.2
git push origin v0.2.2
```

The workflow will:
- run `npm ci`
- run `npm run release:verify`
- publish to npm

## Required GitHub secret

Set this repository secret before relying on automated publishing:
- `NPM_TOKEN`

Use an npm token that has permission to publish the package.

## Packaging guardrails

Before release, make sure:
- `tsx` remains in `dependencies` because the installed `pinchy` bin executes through it
- `npm pack --dry-run` does not include nested build caches or local runtime state
- `npm run pinchy:install-smoke` passes against the packed tarball
