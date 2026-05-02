export function buildUnifiedWeeklyModelOptions(weeklyReportModels = []) {
  const deepseekModels = (weeklyReportModels.length > 0 ? weeklyReportModels : [
    { key: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { key: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }
  ]).map(model => ({
    key: `deepseek:${model.key}`,
    provider: 'deepseek',
    modelKey: model.key,
    label: model.label || model.model || model.key,
    isDefault: model.isDefault
  }));

  return [
    ...deepseekModels,
    {
      key: 'kimi:kimi-k2',
      provider: 'kimi',
      modelKey: '',
      label: 'KIMI K2',
      isDefault: false
    }
  ];
}

export function parseUnifiedWeeklyModelKey(value = '') {
  const [provider, ...rest] = value.split(':');
  return {
    provider: provider || 'deepseek',
    modelKey: rest.join(':')
  };
}
