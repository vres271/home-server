import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToolbarModule } from 'primeng/toolbar';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';

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

  isMobileMenuOpen = false;

  // Неизменяемый массив — мутировать не планируем
  readonly menuItems = [
    { label: 'Главная', icon: 'pi pi-home', routerLink: ['/dashboard'] },
    { label: 'Торренты', icon: 'pi pi-download', routerLink: ['/torrents'] },
    { label: 'Настройки', icon: 'pi pi-cog', routerLink: ['/settings'] }
  ];

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.cdr.markForCheck();
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
    this.cdr.markForCheck();
  }

  // 🔥 Обработчик закрытия через X/backdrop
  onSidebarVisibleChange(visible: boolean) {
    this.isMobileMenuOpen = visible;
    this.cdr.markForCheck();
  }
}