import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToolbarModule } from 'primeng/toolbar';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar'; // <-- Добавлено

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToolbarModule, ButtonModule, SidebarModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent {
  isMobileMenuOpen = false;

  menuItems = [
    { label: 'Главная', icon: 'pi pi-home', routerLink: ['/dashboard'] },
    { label: 'Торренты', icon: 'pi pi-download', routerLink: ['/torrents'] },
    { label: 'Настройки', icon: 'pi pi-cog', routerLink: ['/settings'] }
  ];

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }
}