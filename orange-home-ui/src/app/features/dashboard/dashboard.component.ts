import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="p-4">
      <h2>Добро пожаловать в OrangePi Hub</h2>
      <p>Здесь будет мониторинг системы и быстрый доступ к функциям.</p>
    </div>
  `
})
export class DashboardComponent {}