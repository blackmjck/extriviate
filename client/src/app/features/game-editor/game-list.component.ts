import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Game } from '@extriviate/shared';
import { GameService } from '../../core/services/game.service';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-game-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './game-list.component.html',
  styleUrls: ['./game-list.component.scss'],
})
export class GameListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);

  readonly games = signal<Game[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_SIZE) + 1);
  readonly totalPages = computed(() => Math.ceil(this.total() / PAGE_SIZE));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  ngOnInit(): void {
    this.loadGames();
  }

  async loadGames(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.gameService.getGames(this.offset(), PAGE_SIZE);
      this.games.set(res.data.items);
      this.total.set(res.data.total);
    } catch {
      this.error.set('Failed to load games.');
    } finally {
      this.loading.set(false);
    }
  }

  nextPage(): void {
    this.offset.update((o) => o + PAGE_SIZE);
    this.loadGames();
  }

  prevPage(): void {
    this.offset.update((o) => Math.max(0, o - PAGE_SIZE));
    this.loadGames();
  }

  createGame(): void {
    this.router.navigate(['/games', 'new']);
  }

  editGame(id: number): void {
    this.router.navigate(['/games', id]);
  }

  hostGame(id: number): void {
    void this.router.navigate(['/games', id, 'host']);
  }

  async deleteGame(id: number): Promise<void> {
    if (!confirm('Are you sure you want to delete this game?')) return;
    try {
      await this.gameService.deleteGame(id);
      this.loadGames();
    } catch {
      this.error.set('Failed to delete game.');
    }
  }
}
