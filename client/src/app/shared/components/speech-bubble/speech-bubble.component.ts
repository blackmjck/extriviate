import { Component, input } from '@angular/core';

@Component({
  selector: 'app-speech-bubble',
  standalone: true,
  templateUrl: './speech-bubble.component.html',
  styleUrl: './speech-bubble.component.scss',
})
export class SpeechBubbleComponent {
  readonly text = input.required<string>();
  /**
   * Which side of the bubble the tail is drawn on.
   * 'left'  → tail on left,  bubble body extends rightward  (avatar is to the left)
   * 'right' → tail on right, bubble body extends leftward   (avatar is to the right)
   * 'bottom'→ tail at bottom, bubble body extends upward    (avatar is below)
   */
  readonly tailSide = input<'left' | 'right' | 'bottom'>('bottom');
}
