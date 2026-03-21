import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { SpeechRecognitionService } from './speech-recognition.service';

// ---------------------------------------------------------------------------
// Mock SpeechRecognition instance shape

interface MockRecognition {
  continuous: boolean;
  interimResults: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

// ---------------------------------------------------------------------------
// Helper: build a regular (non-arrow) constructor that captures the instance.
// vi.fn() uses an arrow internally and cannot be called with `new`, so we
// use a plain function and attach spy methods to it and the resulting instance.

function makeMockCtor(): { ctor: new () => MockRecognition; getInstance: () => MockRecognition } {
  let capturedInstance: MockRecognition | null = null;

  // Must be a regular function so `new MockCtor()` works.
  // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
  function MockCtor(this: MockRecognition) {
    this.continuous = false;
    this.interimResults = false;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
    capturedInstance = this;
  }

  return {
    ctor: MockCtor as unknown as new () => MockRecognition,
    getInstance: () => {
      if (!capturedInstance) throw new Error('MockCtor was never called with new');
      return capturedInstance;
    },
  };
}

// ---------------------------------------------------------------------------
// Setup helpers

function setupWithoutApi(): SpeechRecognitionService {
  // Ensure neither vendor property exists before the service is constructed
  delete (window as unknown as Record<string, unknown>)['SpeechRecognition'];
  delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];

  TestBed.configureTestingModule({
    providers: [SpeechRecognitionService, provideZonelessChangeDetection()],
  });

  return TestBed.inject(SpeechRecognitionService);
}

function setupWithApi(): { service: SpeechRecognitionService; recognition: MockRecognition } {
  const { ctor, getInstance } = makeMockCtor();

  (window as unknown as Record<string, unknown>)['SpeechRecognition'] = ctor;
  // Remove webkit variant so only the standard one is used
  delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];

  TestBed.configureTestingModule({
    providers: [SpeechRecognitionService, provideZonelessChangeDetection()],
  });

  const service = TestBed.inject(SpeechRecognitionService);

  return { service, recognition: getInstance() };
}

// ---------------------------------------------------------------------------
// Helper to build a fake SpeechRecognitionEvent

function makeSpeechEvent(
  results: Array<{ transcript: string; isFinal: boolean }>,
): SpeechRecognitionEvent {
  const resultList = results.map(({ transcript, isFinal }) => {
    const alternative = { transcript, confidence: 1 };
    const speechResult = Object.assign([alternative], { isFinal, length: 1 });
    return speechResult;
  });

  return {
    results: Object.assign(resultList, { length: resultList.length }),
  } as unknown as SpeechRecognitionEvent;
}

// ---------------------------------------------------------------------------

describe('SpeechRecognitionService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Clean up window properties to avoid leaking state between suites
    delete (window as unknown as Record<string, unknown>)['SpeechRecognition'];
    delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('when SpeechRecognition is unavailable', () => {
    it('isAvailable() is false', () => {
      const service = setupWithoutApi();
      expect(service.isAvailable()).toBe(false);
    });

    it('start() does nothing and does not throw', () => {
      const service = setupWithoutApi();
      expect(() => service.start()).not.toThrow();
    });

    it('stop() does nothing and does not throw', () => {
      const service = setupWithoutApi();
      expect(() => service.stop()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe('when SpeechRecognition is available', () => {
    it('isAvailable() is true', () => {
      const { service } = setupWithApi();
      expect(service.isAvailable()).toBe(true);
    });

    it('sets recognition.continuous to false', () => {
      const { recognition } = setupWithApi();
      expect(recognition.continuous).toBe(false);
    });

    it('sets recognition.interimResults to true', () => {
      const { recognition } = setupWithApi();
      expect(recognition.interimResults).toBe(true);
    });

    // -----------------------------------------------------------------------
    describe('start()', () => {
      it('clears interimTranscript and finalTranscript', () => {
        const { service, recognition } = setupWithApi();
        // Pre-populate transcripts via a simulated result event
        recognition.onresult!(makeSpeechEvent([{ transcript: 'hello', isFinal: false }]));
        recognition.onresult!(makeSpeechEvent([{ transcript: 'world', isFinal: true }]));

        service.start();

        expect(service.interimTranscript()).toBe('');
        expect(service.finalTranscript()).toBe('');
      });

      it('sets isListening to true', () => {
        const { service } = setupWithApi();
        service.start();
        expect(service.isListening()).toBe(true);
      });

      it('calls recognition.start()', () => {
        const { service, recognition } = setupWithApi();
        service.start();
        expect(recognition.start).toHaveBeenCalledOnce();
      });
    });

    // -----------------------------------------------------------------------
    describe('stop()', () => {
      it('calls recognition.stop()', () => {
        const { service, recognition } = setupWithApi();
        service.stop();
        expect(recognition.stop).toHaveBeenCalledOnce();
      });
    });

    // -----------------------------------------------------------------------
    describe('onresult callback', () => {
      it('updates interimTranscript when the result is not final', () => {
        const { service, recognition } = setupWithApi();
        recognition.onresult!(makeSpeechEvent([{ transcript: 'hell', isFinal: false }]));
        expect(service.interimTranscript()).toBe('hell');
        expect(service.finalTranscript()).toBe('');
      });

      it('updates finalTranscript when the result is final', () => {
        const { service, recognition } = setupWithApi();
        recognition.onresult!(makeSpeechEvent([{ transcript: 'hello world', isFinal: true }]));
        expect(service.finalTranscript()).toBe('hello world');
      });

      it('clears interimTranscript when all results in the event are final', () => {
        const { service, recognition } = setupWithApi();
        // First push an interim result
        recognition.onresult!(makeSpeechEvent([{ transcript: 'hel', isFinal: false }]));
        // Then a final result — the interim accumulator resets to ''
        recognition.onresult!(makeSpeechEvent([{ transcript: 'hello', isFinal: true }]));
        expect(service.interimTranscript()).toBe('');
      });

      it('accumulates text from multiple results in a single event', () => {
        const { service, recognition } = setupWithApi();
        recognition.onresult!(
          makeSpeechEvent([
            { transcript: 'foo ', isFinal: true },
            { transcript: 'bar', isFinal: true },
          ]),
        );
        expect(service.finalTranscript()).toBe('foo bar');
      });

      it('does not update finalTranscript when an interim result arrives', () => {
        const { service, recognition } = setupWithApi();
        // Set a known final transcript first
        recognition.onresult!(makeSpeechEvent([{ transcript: 'previous', isFinal: true }]));
        const before = service.finalTranscript();

        // Then an interim-only event fires
        recognition.onresult!(makeSpeechEvent([{ transcript: 'new interim', isFinal: false }]));

        expect(service.finalTranscript()).toBe(before);
      });
    });

    // -----------------------------------------------------------------------
    describe('onend callback', () => {
      it('sets isListening to false', () => {
        const { service, recognition } = setupWithApi();
        service.start();
        expect(service.isListening()).toBe(true);

        recognition.onend!();

        expect(service.isListening()).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    describe('onerror callback', () => {
      it('sets isListening to false', () => {
        const { service, recognition } = setupWithApi();
        service.start();
        expect(service.isListening()).toBe(true);

        recognition.onerror!();

        expect(service.isListening()).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('webkitSpeechRecognition fallback', () => {
    it('uses webkitSpeechRecognition when window.SpeechRecognition is absent', () => {
      delete (window as unknown as Record<string, unknown>)['SpeechRecognition'];

      const { ctor } = makeMockCtor();
      (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = ctor;

      TestBed.configureTestingModule({
        providers: [SpeechRecognitionService, provideZonelessChangeDetection()],
      });

      const service = TestBed.inject(SpeechRecognitionService);
      expect(service.isAvailable()).toBe(true);
    });
  });
});
