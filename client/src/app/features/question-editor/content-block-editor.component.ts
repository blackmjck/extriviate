import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ContentBlock } from '@extriviate/shared';
import { UploadComponent } from '../upload/upload.component';

@Component({
  selector: 'app-content-block-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UploadComponent],
  templateUrl: './content-block-editor.component.html',
  styleUrls: ['./content-block-editor.component.scss'],
})
export class ContentBlockEditorComponent {
  readonly blocks = input.required<ContentBlock[]>();
  readonly blocksChange = output<ContentBlock[]>();

  readonly label = input<string>('Content');

  addText(): void {
    this.blocksChange.emit([...this.blocks(), { type: 'text', value: '' }]);
  }

  addImage(): void {
    this.blocksChange.emit([...this.blocks(), { type: 'image', url: '', alt: '' }]);
  }

  addVideo(): void {
    this.blocksChange.emit([...this.blocks(), { type: 'video', url: '', caption: '' }]);
  }

  remove(index: number): void {
    const updated = this.blocks().filter((_, i) => i !== index);
    this.blocksChange.emit(updated);
  }

  moveUp(index: number): void {
    if (index === 0) return;
    const arr = [...this.blocks()];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    this.blocksChange.emit(arr);
  }

  moveDown(index: number): void {
    const arr = this.blocks();
    if (index === arr.length - 1) return;
    const copy = [...arr];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    this.blocksChange.emit(copy);
  }

  updateText(index: number, value: string): void {
    const copy = this.blocks().map((b, i) =>
      i === index && b.type === 'text' ? { ...b, value } : b,
    );
    this.blocksChange.emit(copy);
  }

  updateImageUrl(index: number, url: string): void {
    const copy = this.blocks().map((b, i) =>
      i === index && b.type === 'image' ? { ...b, url } : b,
    );
    this.blocksChange.emit(copy);
  }

  updateImageAlt(index: number, alt: string): void {
    const copy = this.blocks().map((b, i) =>
      i === index && b.type === 'image' ? { ...b, alt } : b,
    );
    this.blocksChange.emit(copy);
  }

  updateVideoUrl(index: number, url: string): void {
    const copy = this.blocks().map((b, i) =>
      i === index && b.type === 'video' ? { ...b, url } : b,
    );
    this.blocksChange.emit(copy);
  }

  updateVideoCaption(index: number, caption: string): void {
    const copy = this.blocks().map((b, i) =>
      i === index && b.type === 'video' ? { ...b, caption } : b,
    );
    this.blocksChange.emit(copy);
  }

  onUploaded(index: number, publicUrl: string): void {
    const copy = this.blocks().map((b, i) => {
      if (i !== index) return b;
      if (b.type === 'image') return { ...b, url: publicUrl };
      if (b.type === 'video') return { ...b, url: publicUrl };
      return b;
    });
    this.blocksChange.emit(copy);
  }
}
