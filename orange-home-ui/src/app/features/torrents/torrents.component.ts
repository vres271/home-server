import { Component } from '@angular/core';
import { TabViewModule } from 'primeng/tabview';
import { SearchComponent } from './search/search.component';
import { DownloadsComponent } from './downloads/downloads.component';

const enum Tabs {
  Downloads = 0,
  Search = 0,
}

@Component({
  selector: 'app-torrents',
  standalone: true,
  imports: [TabViewModule, SearchComponent, DownloadsComponent],
  templateUrl: './torrents.component.html',
  styleUrls: ['./torrents.component.css']
})
export class TorrentsComponent {

  activeTabIndex = Tabs.Downloads; 

  onTorrentAdded() {
    this.activeTabIndex = Tabs.Search; 
  }

}