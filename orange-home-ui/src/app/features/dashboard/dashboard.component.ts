import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="m-4 orange-wrapper">
      <img src="favicon.svg" alt="OrangePi Hub" width="100%"/>
      <div class="hello">Дарова</div>
    </div>
  `,
  styles: `
    .orange-wrapper {
      position: relative;
    }
    .hello {
      font-size: 3.5rem;
      font-weight: 500;
      position: absolute;
      top: 0px;
      left: 0px;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;      
      color: var(--p-gray-100);
    }
  `,
})
export class DashboardComponent {}