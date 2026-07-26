export const environment = {
  production: false,

  // В dev-режиме запросы идут через proxy.conf.json
  // Поэтому пути относительные, без хоста
  jackett: {
    apiUrl: '/api/jackett',
    apiKey: 'warfzvlj1xj4lg0m0bj9wzcjibsbk45t'  // Найди в Jackett UI → API Key
  },

  qbittorrent: {
    apiUrl: '/api/qbittorrent',
    username: '',
    password: ''  // Стандартный пароль qBittorrent
  },

  // Настройки по умолчанию для торрентов
  torrents: {
    defaultSavePath: '/mnt/shared',
    sequentialDownload: true,
    firstLastPiecePrio: true
  }
};