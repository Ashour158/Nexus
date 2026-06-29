# Contributing to Nexus CRM

## Development Workflow

1. Create a feature branch: `git checkout -b feature/description`
2. Make changes following our coding standards
3. Run tests: `pnpm test`
4. Run linting: `pnpm lint`
5. Commit with conventional commits: `feat: add new feature`
6. Push and create a PR

## Code Standards

- TypeScript strict mode enabled
- ESLint + Prettier enforced via pre-commit hooks
- All code must have tests
- API changes require OpenAPI spec updates

## Commit Convention

```
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Formatting, missing semi colons, etc
refactor: Code change that neither fixes a bug nor adds a feature
test:     Adding or updating tests
chore:    Build process or auxiliary tool changes
perf:     Performance improvement
security: Security fix
```

## PR Checklist

- [ ] Tests pass
- [ ] Linting passes
- [ ] Type checking passes
- [ ] OpenAPI specs updated (if applicable)
- [ ] Migration files included (if DB changes)
- [ ] Feature flags added (if new feature)
