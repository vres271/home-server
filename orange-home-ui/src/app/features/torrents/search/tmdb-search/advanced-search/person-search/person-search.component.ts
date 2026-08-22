import { Component, EventEmitter, Output, ChangeDetectionStrategy, ChangeDetectorRef, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { TmdbService } from '../../../../../../core/services/tmdb.service';
import { TmdbPerson } from '../../../../../../core/models/tmdb.model';

@Component({
  selector: 'app-person-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, 
    FormsModule, 
    InputTextModule, 
    IconFieldModule, 
    InputIconModule, 
    ButtonModule,
    TooltipModule
  ],
  templateUrl: './person-search.component.html',
  styleUrls: ['./person-search.component.css']
})
export class PersonSearchComponent {
  private tmdb = inject(TmdbService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;  
  @Output() personSelected = new EventEmitter<{ id: number, name: string }>();

  query = '';
  results: TmdbPerson[] = [];
  isLoading = false;
  selectedPersonName: string | null = null;
  isScrollable = false;
  isScrolledToEnd = false;

  ngAfterViewInit(): void {
    // Проверка при инициализации (на случай, если результаты уже были)
    setTimeout(() => this.checkScrollState(), 100);
  }

  onScroll(): void {
    this.checkScrollState();
  }

  private checkScrollState(): void {
    if (!this.scrollContainer?.nativeElement) return;
    
    const el = this.scrollContainer.nativeElement;
    
    // 1. Проверяем, есть ли реальный скролл (с запасом 2px на погрешности округления браузера)
    this.isScrollable = el.scrollWidth > el.clientWidth + 2;
    
    // 2. Если скролл есть, проверяем, доскроллили ли мы до конца
    if (this.isScrollable) {
      this.isScrolledToEnd = (el.scrollWidth - el.scrollLeft - el.clientWidth) < 5;
    } else {
      // Если скролла нет, считаем что мы "в конце", чтобы гарантированно скрыть стрелку
      this.isScrolledToEnd = true;
    }
    
    this.cdr.markForCheck();
  }

  // Перевод профессий для красивого отображения на бейдже
  getDepartmentLabel(dept: string): string {
    const map: Record<string, string> = {
      'Acting': 'Актер',
      'Directing': 'Режиссер',
      'Writing': 'Сценарист',
      'Production': 'Продюсер',
      'Camera': 'Оператор',
      'Sound': 'Звук',
      'Art': 'Художник',
      'Editing': 'Монтаж'
    };
    return map[dept] || dept;
  }

  performSearch(): void {
    if (!this.query.trim() || this.isLoading) return;
    
    this.isLoading = true;
    this.selectedPersonName = null;
    this.results = [];
    this.isScrollable = false;
    this.isScrolledToEnd = false;
    this.cdr.markForCheck();

    this.tmdb.searchPerson(this.query.trim()).subscribe({
      next: (persons) => {
        this.results = persons;
        this.isLoading = false;
        this.cdr.markForCheck();
        
        // Даём браузеру 100мс отрисовать карточки (благодаря aspect-ratio они занимают место сразу)
        setTimeout(() => this.checkScrollState(), 100);
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onQueryChange(value: string): void {
    this.query = value;
    // Если пользователь начал стирать или менять выбранное имя, сбрасываем выбор
    if (this.selectedPersonName && value !== this.selectedPersonName) {
      this.selectedPersonName = null;
      this.personSelected.emit({ id: 0, name: '' });
    }
  }

  onSelect(person: TmdbPerson): void {
    this.selectedPersonName = person.name;
    this.query = person.name;
    this.results = []; // Скрываем результаты после выбора
    this.personSelected.emit({ id: person.id, name: person.name });
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.query = '';
    this.selectedPersonName = null;
    this.results = [];
    this.personSelected.emit({ id: 0, name: '' });
    this.cdr.markForCheck();
  }

  getProfileUrl(path: string | null): string | null {
    return this.tmdb.getPosterUrl(path);
  }

}