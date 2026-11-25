# Contributing to Odoo Client

First off, thank you for considering contributing to Odoo Client! It's people like you that make Odoo Client such a great tool.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Odoo Client. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

- **Check for existing issues**: Before you create a new issue, please check if the issue has already been reported.

- **Provide details**: When reporting a bug, please include as much information as possible, including:
  - Your Odoo version (14, 15, 16, 17, 18, 19).
  - Your Node.js version.
  - A clear and concise description of the bug.
  - Steps to reproduce the behavior.
  - Expected vs. actual results.

### Suggesting Enhancements

If you have an idea for a new feature or improvement:

- **Open an issue**: Use the enhancement label and explain the reasoning behind the suggestion.
- **Scope**: Keep suggestions focused and clear.

### Pull Requests

1. **Fork the repository** and create your branch from `main`.
2. **Install dependencies**: `pnpm install`.
3. **Make your changes**: Ensure your code follows the established style (ESLint and Prettier).
4. **Add tests**: If you're adding a feature or fixing a bug, please include tests.
5. **Verify**: Run `npm run lint` and `npm test` to ensure everything is working.
6. **Submit**: Open a Pull Request with a clear description of the change.

## Style Guide

- We use **TypeScript** for type safety.
- We follow the **ESLint Flat Config** (v10) for linting.
- We use **Prettier** for formatting.
- Please ensure all imports are ordered correctly and unused imports are removed.

## Releasing

Releases are published to npm, then to GitHub Packages, by `.github/workflows/publish.yml` when a `vX.Y.Z` tag is pushed. The workflow uses npm **trusted publishing**: GitHub proves its identity to npm, so there is no npm token to store or renew.

1. Set the version: `npm version X.Y.Z --no-git-tag-version`, then commit `package.json` and `package-lock.json` as `chore(release): X.Y.Z` and push to `main`.
2. Tag and push: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`. The tag must match `package.json`, or the workflow stops.
3. Approve the `npm-publish` environment on the workflow run. The job then publishes to npm with provenance and creates the GitHub release.

**Trusted publisher on npmjs.com.** It must exist before the first release that uses it, and a new one expires unless it publishes **within 2 days**, so create it on the day you tag. On npmjs.com, open `@vvhybe/odoo-client` → **Settings** → **Trusted publishing** → **GitHub Actions** and enter, exactly (fields are case-sensitive):

| Field | Value |
| --- | --- |
| Organization or user | `vvhybe` |
| Repository | `odoo-client` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-publish` |

With npm 11.15.0 or later you can do the same from the command line: `npm trust github @vvhybe/odoo-client --file publish.yml --repo vvhybe/odoo-client --env npm-publish --allow-publish`.

After the first trusted release succeeds:

- on GitHub, make the package public: **Packages** → `odoo-client` → **Package settings** → **Change visibility**. GitHub creates packages as private;
- delete the repository secret `NPM_TOKEN` and revoke that token on npmjs.com;
- in the package's **Settings** → **Publishing access**, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working.

## Legal

By contributing to Odoo Client, you agree that your contributions will be licensed under its [MIT License](LICENSE).
