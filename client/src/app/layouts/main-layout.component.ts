import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteHeaderComponent } from '../shared/components/site-header/site-header.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, SiteHeaderComponent],
  template: `
    <app-site-header />
    <main>
      <router-outlet />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {}
