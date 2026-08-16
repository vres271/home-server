import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToolbarModule } from 'primeng/toolbar';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    ToolbarModule, ButtonModule, SidebarModule
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent {
  private cdr = inject(ChangeDetectorRef);
  private themeService = inject(ThemeService);

  isMobileMenuOpen = false;

  readonly menuItems = [
    { label: 'Главная', icon: 'pi pi-home', routerLink: ['/dashboard'] },
    { label: 'Торренты', icon: 'pi pi-download', routerLink: ['/torrents'] },
    { label: 'Настройки', icon: 'pi pi-cog', routerLink: ['/settings'] }
  ];

  // Signal с текущей темой
  theme = this.themeService.theme;

  // Вычисляемое свойство для иконки
  themeIcon = computed(() => this.theme() === 'dark' ? 'pi pi-sun' : 'pi pi-moon');

  // Вычисляемое свойство для подписи
  themeLabel = computed(() => this.theme() === 'dark' ? 'Светлая тема' : 'Тёмная тема');

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.cdr.markForCheck();
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
    this.cdr.markForCheck();
  }

  onSidebarVisibleChange(visible: boolean) {
    this.isMobileMenuOpen = visible;
    this.cdr.markForCheck();
  }

  toggleTheme() {
    this.themeService.toggle();
    this.closeMobileMenu();
  }
}