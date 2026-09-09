import { ApplicationConfig, inject, provideZoneChangeDetection, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeng/themes/lara';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { ConfigService } from './core/services/config.service';
import { VersionService } from './core/services/version.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    providePrimeNG({
      theme: {
        preset: Lara,
        options: {
          darkModeSelector: '.dark'     
        }
      }
    }),
    provideAppInitializer(() => {
      const configService = inject(ConfigService);
      return configService.loadConfig();
    }),
    provideAppInitializer(() => {
      const versionService = inject(VersionService);
      return firstValueFrom(versionService.loadVersion());
    })    
  ]
};