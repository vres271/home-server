import { Injectable } from "@angular/core";
import { Filter, HDR_FILTER, QUALITY_FILTER, TRANSLATION_FILTER } from "../models/filter.model";
import { JackettResult } from "../models/jackett.model";

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly LS_KEY = 'torrent_filters';
  
  // Активные фильтры (сезон не сохраняется)
  private activeFilters: Map<string, Set<string>> = new Map();
  
  // Доступные фильтры
  private availableFilters: Filter[] = [QUALITY_FILTER, HDR_FILTER, TRANSLATION_FILTER];

  constructor() {
    this.loadFromLocalStorage();
  }

  // Получить все доступные фильтры
  getAvailableFilters(): Filter[] {
    return this.availableFilters;
  }

  // Применить фильтры к раздачам
  applyFilters(results: JackettResult[], season: number): JackettResult[] {
    let filtered = results;

    // Фильтр по сезону
    if (season > 0) {
      filtered = this.filterBySeason(filtered, season);
    }

    // Применяем остальные активные фильтры
    for (const [filterType, selectedValues] of this.activeFilters) {
      if (selectedValues.size === 0) continue;

      const filter = this.availableFilters.find(f => f.id === filterType);
      if (!filter) continue;

      filtered = filtered.filter(result => {
        const title = this.getDisplayTitle(result);
        // Раздача проходит, если соответствует ХОТЯ БЫ ОДНОМУ выбранному значению
        return Array.from(selectedValues).some(valueId => {
          const value = filter.values.find(v => v.id === valueId);
          return value && value.pattern.test(title);
        });
      });
    }

    return filtered;
  }

  // Переключить значение фильтра
  toggleFilterValue(filterId: string, valueId: string) {
    const filter = this.availableFilters.find(f => f.id === filterId);
    if (!filter) return;

    if (!this.activeFilters.has(filterId)) {
      this.activeFilters.set(filterId, new Set());
    }

    const selected = this.activeFilters.get(filterId)!;
    if (selected.has(valueId)) {
      selected.delete(valueId);
    } else {
      selected.add(valueId);
    }

    // Сохраняем в LS только если фильтр persistable
    if (filter.persistable) {
      this.saveToLocalStorage();
    }
  }

  // Проверить, активно ли значение
  isValueSelected(filterId: string, valueId: string): boolean {
    return this.activeFilters.get(filterId)?.has(valueId) ?? false;
  }

  // Сбросить все фильтры
  clearAllFilters() {
    this.activeFilters.clear();
    this.saveToLocalStorage();
  }

  private filterBySeason(results: JackettResult[], season: number): JackettResult[] {
    // Твоя существующая логика фильтрации по сезону
    const seasonStr = season.toString().padStart(2, '0');
    const seasonNum = season.toString();
    
    const patterns = [
      new RegExp(`[sS]${seasonStr}(?!\\d)`, 'i'),
      new RegExp(`[sS]0?\\d+[\\-\\–][sS]?0?(${seasonNum}|${seasonStr})\\b`, 'i'),
      new RegExp(`(season|сезон)\\s*${seasonNum}\\b`, 'i')
    ];

    return results.filter(result => {
      const title = this.getDisplayTitle(result);
      return patterns.some(pattern => pattern.test(title));
    });
  }

  private getDisplayTitle(result: JackettResult): string {
    return (result.Description && result.Description !== result.Title)
      ? result.Description
      : (result.Title || '');
  }

  private saveToLocalStorage() {
    const data: Record<string, string[]> = {};
    for (const [filterId, values] of this.activeFilters) {
      const filter = this.availableFilters.find(f => f.id === filterId);
      if (filter?.persistable) {
        data[filterId] = Array.from(values);
      }
    }
    localStorage.setItem(this.LS_KEY, JSON.stringify(data));
  }

  private loadFromLocalStorage() {
    const saved = localStorage.getItem(this.LS_KEY);
    if (!saved) return;

    try {
      const data = JSON.parse(saved) as Record<string, string[]>;
      for (const [filterId, values] of Object.entries(data)) {
        this.activeFilters.set(filterId, new Set(values));
      }
    } catch (e) {
      console.error('Failed to load filters from LS', e);
    }
  }
}