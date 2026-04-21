# Releasing Pinchy

## Manual release

1. Update code and docs.
2. Bump `package.json` version.
3. Run validation:

```bash
npm test
npm run pinchy:install-smoke
npm pack --dry-run
```

4. Publish manually:

```bash
npm publish
```

If npm requires stronger publish authentication, use your configured token or publish flow.

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
- run `npm run check`
- run `npm test`
- run `npm run pinchy:install-smoke`
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
