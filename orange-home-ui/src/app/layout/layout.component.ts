import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToolbarModule } from 'primeng/toolbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToolbarModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent {
  menuItems = [
    { label: 'Главная', icon: 'pi pi-home', routerLink: ['/dashboard'] },
    { label: 'Торренты', icon: 'pi pi-download', routerLink: ['/torrents'] },
    { label: 'Настройки', icon: 'pi pi-cog', routerLink: ['/settings'] }
  ];
}