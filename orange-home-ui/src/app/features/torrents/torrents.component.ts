import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { TabViewModule } from 'primeng/tabview';
import { SearchComponent } from './search/search.component';
import { DownloadsComponent } from './downloads/downloads.component';

const enum Tabs {
  Downloads = 0,
  Search = 1,
}

@Component({
  selector: 'app-torrents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TabViewModule, SearchComponent, DownloadsComponent],
  templateUrl: './torrents.component.html',
  styleUrls: ['./torrents.component.css']
})
export class TorrentsComponent {

  private cdr = inject(ChangeDetectorRef);

  activeTabIndex = Tabs.Downloads;

  onTorrentAdded() {
    this.activeTabIndex = Tabs.Downloads;
    this.cdr.markForCheck();
  }

  onActiveIndexChange(index: number) {
    this.activeTabIndex = index;
    this.cdr.markForCheck();
  }
}