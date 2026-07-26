export const environment = {
  production: true,

  // В продакшене nginx проксирует те же пути,
  // поэтому конфигурация идентична dev
  jackett: {
    apiUrl: '/api/jackett',
    apiKey: 'warfzvlj1xj4lg0m0bj9wzcjibsbk45t'
  },

  qbittorrent: {
    apiUrl: '/api/qbittorrent',
    username: '',
    password: ''
  },

  torrents: {
    defaultSavePath: '/mnt/shared',
    sequentialDownload: true,
    firstLastPiecePrio: true
  }
};