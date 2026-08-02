import { Component } from '@angular/core';
import { TabViewModule } from 'primeng/tabview';
import { SearchComponent } from './search/search.component';
import { DownloadsComponent } from './downloads/downloads.component';

@Component({
  selector: 'app-torrents',
  standalone: true,
  imports: [TabViewModule, SearchComponent, DownloadsComponent],
  templateUrl: './torrents.component.html',
  styleUrls: ['./torrents.component.css']
})
export class TorrentsComponent {

  activeTabIndex = 1; 

  onTorrentAdded() {
    this.activeTabIndex = 0; 
  }

}