import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService, type ActiveTheme } from '../../../core/services/theme.service';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'contentinfo' },
})
export class FooterComponent {
  protected readonly themeService = inject(ThemeService);

  readonly year = new Date().getFullYear();

  readonly themeOptions: { value: ActiveTheme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];

  protected onThemeChange(event: Event): void {
    this.themeService.setTheme((event.target as HTMLSelectElement).value as ActiveTheme);
  }
}
