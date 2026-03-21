import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ContentBlock } from '@extriviate/shared';
import { ContentBlocksComponent } from './content-blocks.component';

// ---------------------------------------------------------------------------

function setup(blocks: ContentBlock[]): {
  fixture: ComponentFixture<ContentBlocksComponent>;
  component: ContentBlocksComponent;
  el: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [ContentBlocksComponent],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(ContentBlocksComponent);
  fixture.componentRef.setInput('blocks', blocks);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

// ---------------------------------------------------------------------------

describe('ContentBlocksComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  // -------------------------------------------------------------------------
  describe('isText()', () => {
    it('returns true for a text block', () => {
      const { component } = setup([]);
      expect(component.isText({ type: 'text', value: 'hello' })).toBe(true);
    });

    it('returns false for an image block', () => {
      const { component } = setup([]);
      expect(component.isText({ type: 'image', url: 'http://example.com/img.jpg' })).toBe(false);
    });

    it('returns false for a video block', () => {
      const { component } = setup([]);
      expect(component.isText({ type: 'video', url: 'http://example.com/clip.mp4' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('isImage()', () => {
    it('returns true for an image block', () => {
      const { component } = setup([]);
      expect(component.isImage({ type: 'image', url: 'http://example.com/img.jpg' })).toBe(true);
    });

    it('returns false for a text block', () => {
      const { component } = setup([]);
      expect(component.isImage({ type: 'text', value: 'hello' })).toBe(false);
    });

    it('returns false for a video block', () => {
      const { component } = setup([]);
      expect(component.isImage({ type: 'video', url: 'http://example.com/clip.mp4' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('isVideo()', () => {
    it('returns true for a video block', () => {
      const { component } = setup([]);
      expect(component.isVideo({ type: 'video', url: 'http://example.com/clip.mp4' })).toBe(true);
    });

    it('returns false for a text block', () => {
      const { component } = setup([]);
      expect(component.isVideo({ type: 'text', value: 'hello' })).toBe(false);
    });

    it('returns false for an image block', () => {
      const { component } = setup([]);
      expect(component.isVideo({ type: 'image', url: 'http://example.com/img.jpg' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('template: text block', () => {
    it('renders a <p> element with the block value', () => {
      const { el } = setup([{ type: 'text', value: 'What is a neutron star?' }]);
      const p = el.querySelector('p.block-text');
      expect(p).not.toBeNull();
      expect(p!.textContent?.trim()).toBe('What is a neutron star?');
    });

    it('applies the bold class when formatting is "bold"', () => {
      const { el } = setup([{ type: 'text', value: 'Bold text', formatting: 'bold' }]);
      expect(el.querySelector('p.block-text')?.classList).toContain('bold');
    });

    it('applies the italic class when formatting is "italic"', () => {
      const { el } = setup([{ type: 'text', value: 'Italic text', formatting: 'italic' }]);
      expect(el.querySelector('p.block-text')?.classList).toContain('italic');
    });

    it('applies the underline class when formatting is "underline"', () => {
      const { el } = setup([{ type: 'text', value: 'Underline text', formatting: 'underline' }]);
      expect(el.querySelector('p.block-text')?.classList).toContain('underline');
    });

    it('applies the code class when formatting is "code"', () => {
      const { el } = setup([{ type: 'text', value: 'console.log()', formatting: 'code' }]);
      expect(el.querySelector('p.block-text')?.classList).toContain('code');
    });

    it('does not apply any formatting class when formatting is absent', () => {
      const { el } = setup([{ type: 'text', value: 'Plain text' }]);
      const classList = el.querySelector('p.block-text')!.classList;
      expect(classList).not.toContain('bold');
      expect(classList).not.toContain('italic');
      expect(classList).not.toContain('underline');
      expect(classList).not.toContain('code');
    });

    it('does not render an <img> or <video> for a text block', () => {
      const { el } = setup([{ type: 'text', value: 'Some text' }]);
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('video')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('template: image block', () => {
    it('renders an <img> element with the correct src', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg' }]);
      const img = el.querySelector('img.block-image');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('http://cdn.example.com/photo.jpg');
    });

    it('sets the alt attribute when alt is provided', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg', alt: 'A scenic view' }]);
      expect(el.querySelector('img.block-image')!.getAttribute('alt')).toBe('A scenic view');
    });

    it('sets alt to empty string when alt is absent', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg' }]);
      expect(el.querySelector('img.block-image')!.getAttribute('alt')).toBe('');
    });

    it('renders a <figcaption> when alt is provided', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg', alt: 'Caption here' }]);
      const caption = el.querySelector('figcaption.block-caption');
      expect(caption).not.toBeNull();
      expect(caption!.textContent?.trim()).toBe('Caption here');
    });

    it('omits <figcaption> when alt is absent', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg' }]);
      expect(el.querySelector('figcaption')).toBeNull();
    });

    it('wraps the image in a <figure class="block-image-wrap">', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg' }]);
      expect(el.querySelector('figure.block-image-wrap')).not.toBeNull();
    });

    it('does not render a <p> or <video> for an image block', () => {
      const { el } = setup([{ type: 'image', url: 'http://cdn.example.com/photo.jpg' }]);
      expect(el.querySelector('p')).toBeNull();
      expect(el.querySelector('video')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('template: video block', () => {
    it('renders a <video> element with the correct src', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4' }]);
      const video = el.querySelector('video.block-video');
      expect(video).not.toBeNull();
      expect(video!.getAttribute('src')).toBe('http://cdn.example.com/clip.mp4');
    });

    it('renders a <figcaption> when caption is provided', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4', caption: 'Intro video' }]);
      const caption = el.querySelector('figcaption.block-caption');
      expect(caption).not.toBeNull();
      expect(caption!.textContent?.trim()).toBe('Intro video');
    });

    it('omits <figcaption> when caption is absent', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4' }]);
      expect(el.querySelector('figcaption')).toBeNull();
    });

    it('renders a <track> element when caption is provided', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4', caption: 'Intro video' }]);
      const track = el.querySelector('track');
      expect(track).not.toBeNull();
      expect(track!.getAttribute('kind')).toBe('captions');
      expect(track!.getAttribute('label')).toBe('Intro video');
    });

    it('omits <track> when caption is absent', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4' }]);
      expect(el.querySelector('track')).toBeNull();
    });

    it('wraps the video in a <figure class="block-video-wrap">', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4' }]);
      expect(el.querySelector('figure.block-video-wrap')).not.toBeNull();
    });

    it('does not render a <p> or <img> for a video block', () => {
      const { el } = setup([{ type: 'video', url: 'http://cdn.example.com/clip.mp4' }]);
      expect(el.querySelector('p')).toBeNull();
      expect(el.querySelector('img')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('template: empty blocks array', () => {
    it('renders nothing when blocks is empty', () => {
      const { el } = setup([]);
      expect(el.querySelector('p')).toBeNull();
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('video')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('template: multiple mixed blocks', () => {
    const mixedBlocks: ContentBlock[] = [
      { type: 'text', value: 'Round one clue' },
      { type: 'image', url: 'http://cdn.example.com/map.png', alt: 'A map' },
      { type: 'video', url: 'http://cdn.example.com/highlight.mp4', caption: 'Highlight reel' },
      { type: 'text', value: 'Additional context' },
    ];

    it('renders a <p> for each text block', () => {
      const { el } = setup(mixedBlocks);
      const paragraphs = el.querySelectorAll('p.block-text');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0].textContent?.trim()).toBe('Round one clue');
      expect(paragraphs[1].textContent?.trim()).toBe('Additional context');
    });

    it('renders an <img> for the image block', () => {
      const { el } = setup(mixedBlocks);
      const images = el.querySelectorAll('img.block-image');
      expect(images).toHaveLength(1);
      expect(images[0].getAttribute('src')).toBe('http://cdn.example.com/map.png');
    });

    it('renders a <video> for the video block', () => {
      const { el } = setup(mixedBlocks);
      const videos = el.querySelectorAll('video.block-video');
      expect(videos).toHaveLength(1);
      expect(videos[0].getAttribute('src')).toBe('http://cdn.example.com/highlight.mp4');
    });

    it('renders all four blocks in total', () => {
      const { el } = setup(mixedBlocks);
      const textCount = el.querySelectorAll('p.block-text').length;
      const imgCount = el.querySelectorAll('img.block-image').length;
      const videoCount = el.querySelectorAll('video.block-video').length;
      expect(textCount + imgCount + videoCount).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  describe('reactive updates', () => {
    it('re-renders when the blocks input changes', () => {
      const { fixture, el } = setup([{ type: 'text', value: 'Original' }]);

      expect(el.querySelector('p.block-text')!.textContent?.trim()).toBe('Original');

      fixture.componentRef.setInput('blocks', [{ type: 'text', value: 'Updated' }]);
      fixture.detectChanges();

      expect(el.querySelector('p.block-text')!.textContent?.trim()).toBe('Updated');
    });

    it('clears all rendered blocks when input changes to an empty array', () => {
      const { fixture, el } = setup([
        { type: 'text', value: 'Some text' },
        { type: 'image', url: 'http://cdn.example.com/img.jpg' },
      ]);

      expect(el.querySelectorAll('p.block-text')).toHaveLength(1);

      fixture.componentRef.setInput('blocks', []);
      fixture.detectChanges();

      expect(el.querySelector('p')).toBeNull();
      expect(el.querySelector('img')).toBeNull();
    });
  });
});
