import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../../core/services/theme.service';

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

  protected readonly toggleLabel = computed(() =>
    this.themeService.theme() === 'dark' ? 'Light mode' : 'Dark mode',
  );

  protected readonly toggleAriaLabel = computed(() =>
    this.themeService.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
}
