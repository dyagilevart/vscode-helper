export const flavor = {
  loading: 'Lumos! Заглядываем в архив задач…',
  needConfig: 'Чтобы зажечь свет, укажите адрес замка — lumos.baseUrl (без /sd).',
  needAuth: 'Замок не узнаёт вас. Войдите — и свиток задачи откроется.',
  sessionExpired: 'Чары входа рассеялись. Войдите снова, чтобы продолжить.',
  noBranch: 'Палочка не чувствует ветку. Откройте репозиторий с feature/ACRM-…',
  noTaskKey: (branch: string) =>
    `В ветке «${branch}» нет номера заклинания (ACRM-…). Переключитесь на рабочую ветку.`,
  notFound: (taskKey: string) =>
    `В архиве пусто по коду ${taskKey}. Проверьте номер или доступ.`,
  error: (detail: string) => `Что-то сбило заклинание: ${detail}`,
  signedIn: 'Почта доставила доступ. Можно открывать свиток.',
  signedOut: 'Следы входа стёрты. До следующего Lumos.',
  needBaseUrlFirst: 'Сначала укажите lumos.baseUrl — без адреса замок молчит.',
  signInFailed: (detail: string) => `Вход не удался: ${detail}`,
  copiedKey: (taskKey: string) => `${taskKey} скопирован со свитка`,
  copiedUrl: 'Ссылка на задачу скопирована',
} as const;
