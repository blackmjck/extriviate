import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PrivacyComponent } from './privacy.component';

async function setup() {
  TestBed.configureTestingModule({
    imports: [PrivacyComponent],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(PrivacyComponent);
  fixture.detectChanges();
  return { fixture };
}

describe('PrivacyComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an <h1> containing "Privacy Policy"', async () => {
    const { fixture } = await setup();
    const h1: HTMLHeadingElement = fixture.nativeElement.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1.textContent).toContain('Privacy Policy');
  });

  it('renders a paragraph indicating the policy is not yet available', async () => {
    const { fixture } = await setup();
    const p: HTMLParagraphElement = fixture.nativeElement.querySelector('p');
    expect(p).not.toBeNull();
    expect(p.textContent?.toLowerCase()).toContain('not yet available');
  });
});
