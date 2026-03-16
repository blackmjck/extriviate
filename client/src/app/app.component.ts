import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectionStatusComponent } from './shared/components/connection-status/connection-status.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectionStatusComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Eagerly initialize ThemeService so data-theme is applied before first render
  private readonly _theme = inject(ThemeService);
}
