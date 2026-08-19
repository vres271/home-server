import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Output } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { FilterService } from "../../../../core/services/filter.service";

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule],
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.css']
})
export class FilterPanelComponent {
  private filterService = inject(FilterService);
  private cdr = inject(ChangeDetectorRef);

  @Output() filtersChanged = new EventEmitter<void>();

  filters = this.filterService.getAvailableFilters();
  expanded = false; // 🔥 По умолчанию свернутый режим

  toggleExpanded() {
    this.expanded = !this.expanded;
    this.cdr.markForCheck();
  }

  toggleValue(filterId: string, valueId: string) {
    this.filterService.toggleFilterValue(filterId, valueId);
    this.filtersChanged.emit();
    this.cdr.markForCheck();
  }

  isSelected(filterId: string, valueId: string): boolean {
    return this.filterService.isValueSelected(filterId, valueId);
  }

  clearAll() {
    this.filterService.clearAllFilters();
    this.filtersChanged.emit();
    this.cdr.markForCheck();
  }

  // 🔥 Получаем все выбранные значения для свернутого режима
  getSelectedValues(): { filterId: string; valueId: string; label: string }[] {
    const selected: { filterId: string; valueId: string; label: string }[] = [];
    
    for (const filter of this.filters) {
      for (const value of filter.values) {
        if (this.isSelected(filter.id, value.id)) {
          selected.push({
            filterId: filter.id,
            valueId: value.id,
            label: value.label
          });
        }
      }
    }
    
    return selected;
  }

  hasAnyFilter(): boolean {
    return this.getSelectedValues().length > 0;
  }
}