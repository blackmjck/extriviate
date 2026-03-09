import { Component, input } from '@angular/core';
import type { ContentBlock } from '@extriviate/shared';

@Component({
  selector: 'app-content-blocks',
  standalone: true,
  templateUrl: './content-blocks.component.html',
  styleUrl: './content-blocks.component.scss',
})
export class ContentBlocksComponent {
  readonly blocks = input.required<ContentBlock[]>();

  isText(block: ContentBlock): block is Extract<ContentBlock, { type: 'text' }> {
    return block.type === 'text';
  }

  isImage(block: ContentBlock): block is Extract<ContentBlock, { type: 'image' }> {
    return block.type === 'image';
  }

  isVideo(block: ContentBlock): block is Extract<ContentBlock, { type: 'video' }> {
    return block.type === 'video';
  }
}
