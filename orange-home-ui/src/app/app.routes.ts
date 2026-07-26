import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'torrents',
        loadComponent: () => import('./features/torrents/torrents.component').then(m => m.TorrentsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];