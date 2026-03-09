import { Component, inject } from '@angular/core';
import { GameSocketService } from '../../../core/services/game-socket.service';

@Component({
  selector: 'app-connection-status',
  standalone: true,
  templateUrl: './connection-status.component.html',
  styleUrl: './connection-status.component.scss',
})
export class ConnectionStatusComponent {
  readonly socket = inject(GameSocketService);
}
