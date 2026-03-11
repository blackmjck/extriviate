import type { CanDeactivateFn } from '@angular/router';
import type { GameEditorComponent } from './game-editor.component';

export const gameEditorGuard: CanDeactivateFn<GameEditorComponent> = async (component) => {
  await component.autosaveNow();
  return true;
};
