# Contributing to Odoox

First off, thank you for considering contributing to Odoox! It's people like you that make Odoox such a great tool.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Odoox. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

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

## Legal

By contributing to Odoox, you agree that your contributions will be licensed under its [MIT License](LICENSE).
