export type ProviderErrorKind = 'auth' | 'model' | 'provider';

export function classifyProviderError(text: string): ProviderErrorKind {
  const t = (text ?? '').toLowerCase();
  if (
    /(unauthorized|invalid[ _-]?(api[ _-])?key|api key not valid|authentication|permission denied|forbidden|unregistered|\b401\b|\b403\b|insufficient.*permission)/.test(
      t,
    )
  ) {
    return 'auth';
  }
  if (
    /(no longer available|model_not_found|model not found|is not supported|does not exist|unsupported model|decommissioned|not found for api version)/.test(
      t,
    )
  ) {
    return 'model';
  }
  return 'provider';
}
