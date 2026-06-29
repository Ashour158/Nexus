const DEV_PREVIEW_FORBIDDEN_MESSAGE =
  'DEV_PREVIEW_ENABLED is not allowed outside local development.';

type EnvLike = Record<string, string | undefined>;

function isEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function deploymentEnvironment(env: EnvLike): string {
  return String(
    env.DEPLOYMENT_ENV ??
      env.APP_ENV ??
      env.NEXT_PUBLIC_APP_ENV ??
      env.VERCEL_ENV ??
      ''
  ).toLowerCase();
}

function isForbiddenPreviewEnvironment(env: EnvLike): boolean {
  const deployment = deploymentEnvironment(env);
  return (
    env.NODE_ENV === 'production' ||
    deployment === 'production' ||
    deployment === 'prod' ||
    deployment === 'staging' ||
    deployment === 'stage'
  );
}

export function resolveDevPreviewEnabled(env: EnvLike = process.env): boolean {
  const explicitPreviewEnabled = isEnabled(env.DEV_PREVIEW_ENABLED);
  const authBypassEnabled = env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
  const localDevelopmentPreview =
    env.NODE_ENV === 'development' && authBypassEnabled;
  const requested = explicitPreviewEnabled || localDevelopmentPreview;

  if (requested && isForbiddenPreviewEnvironment(env)) {
    throw new Error(DEV_PREVIEW_FORBIDDEN_MESSAGE);
  }

  return localDevelopmentPreview && !isForbiddenPreviewEnvironment(env);
}

export function assertDevPreviewAllowed(env: EnvLike = process.env): void {
  void resolveDevPreviewEnabled(env);
}
