# Releasing

For maintainers. Prereleases go to the `experimental` dist-tag; `publishConfig.tag` and the `publish:experimental`
script both set it.

## Checklist

On a branch (`release/<version>`):

1. **Bump the version** in `packages/semantic-state/package.json`, e.g. `0.1.0-experimental.1`.
2. **Update every mention of the old version.** `grep -rn '<old version>' --include='*.md' --include='*.json' . | grep -v node_modules`
   finds them: both READMEs, `ROADMAP.md`, and the `semantic-state` dependency in each `examples/*/package.json`.
   Then run `npm install` so `package-lock.json` picks up the new version.
3. **Update [`CHANGELOG.md`](packages/semantic-state/CHANGELOG.md)**: rename `[Unreleased]` to
   `[<version>] - <YYYY-MM-DD>`, add a new empty `[Unreleased]` above it, and update the compare links at the bottom.
4. **Check the package**: `npm run smoke:pack`. It also fails if the changelog has no heading for the new version.
5. Open a PR, wait for CI, merge.

Then on an up-to-date `main`:

6. **Publish**: `npm run publish:experimental`. It builds, packs and publishes. It needs `npm login` with 2FA; run it
   in a normal terminal so npm can wait for the browser approval.
7. **Verify the dist-tags**: `npm view semantic-state dist-tags`. `experimental` must point at the new version.
8. **Tag and release on GitHub**:

   ```bash
   git tag v<version> && git push origin v<version>
   gh release create v<version> --prerelease --title v<version> --notes '<the changelog section>'
   ```

## Dist-tags

npm sets `latest` on a package's first publish, so `latest` points at `0.1.0-experimental.0`. npm cannot remove
`latest`, and later prereleases only move `experimental`. Until a stable release, `latest` stays on that first
version; the install instructions use `semantic-state@experimental`. Don't publish a prerelease with `--tag latest`.
