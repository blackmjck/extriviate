import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SpeechBubbleComponent } from './speech-bubble.component';

describe('SpeechBubbleComponent', () => {
  let fixture: ComponentFixture<SpeechBubbleComponent>;

  function setup(text: string, tailSide?: 'left' | 'right' | 'bottom'): HTMLElement {
    TestBed.configureTestingModule({
      imports: [SpeechBubbleComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(SpeechBubbleComponent);
    fixture.componentRef.setInput('text', text);
    if (tailSide !== undefined) {
      fixture.componentRef.setInput('tailSide', tailSide);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders text inside .bubble-text', () => {
    const el = setup('What is a quasar?');
    expect(el.querySelector('.bubble-text')?.textContent?.trim()).toBe('What is a quasar?');
  });

  it('applies tail-bottom class by default', () => {
    const el = setup('Hello');
    expect(el.querySelector('.bubble')?.classList).toContain('tail-bottom');
  });

  it('applies tail-left class when tailSide is left', () => {
    const el = setup('Hello', 'left');
    expect(el.querySelector('.bubble')?.classList).toContain('tail-left');
  });

  it('applies tail-right class when tailSide is right', () => {
    const el = setup('Hello', 'right');
    expect(el.querySelector('.bubble')?.classList).toContain('tail-right');
  });

  it('applies tail-bottom class when tailSide is explicitly bottom', () => {
    const el = setup('Hello', 'bottom');
    expect(el.querySelector('.bubble')?.classList).toContain('tail-bottom');
  });

  it('updates bubble text when text input changes', () => {
    const el = setup('First text');
    fixture.componentRef.setInput('text', 'Updated text');
    fixture.detectChanges();
    expect(el.querySelector('.bubble-text')?.textContent?.trim()).toBe('Updated text');
  });

  it('updates tail class when tailSide input changes', () => {
    const el = setup('Hello', 'left');
    fixture.componentRef.setInput('tailSide', 'right');
    fixture.detectChanges();
    const bubble = el.querySelector('.bubble');
    expect(bubble?.classList).not.toContain('tail-left');
    expect(bubble?.classList).toContain('tail-right');
  });

  it('always renders a .bubble container element', () => {
    const el = setup('Any text');
    expect(el.querySelector('.bubble')).not.toBeNull();
  });
});
