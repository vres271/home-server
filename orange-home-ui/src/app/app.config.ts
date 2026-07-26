import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeng/themes/lara'; // Можно заменить на Aura из '@primeng/themes/aura'

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    // Новая конфигурация темы PrimeNG 19
    providePrimeNG({
      theme: {
        preset: Lara,
        options: {
          darkModeSelector: false // Пока отключаем авто-переключение, используем светлую тему
        }
      }
    })
  ]
};