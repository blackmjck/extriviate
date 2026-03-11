import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  private recognition!: SpeechRecognition;

  readonly isAvailable = signal<boolean>(false);
  readonly isListening = signal<boolean>(false);
  readonly interimTranscript = signal<string>('');
  readonly finalTranscript = signal<string>('');

  constructor() {
    // forget linting, this is just not feasible without using `any` here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.isAvailable.set(false);
      return;
    }

    this.isAvailable.set(true);
    this.recognition = new SpeechRecognitionCtor();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (const result of event.results) {
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      this.interimTranscript.set(interim);
      if (final) {
        this.finalTranscript.set(final);
      }
    };

    this.recognition.onend = () => {
      this.isListening.set(false);
    };

    this.recognition.onerror = () => {
      this.isListening.set(false);
    };
  }

  start(): void {
    if (!this.recognition) {
      return;
    }
    this.interimTranscript.set('');
    this.finalTranscript.set('');
    this.isListening.set(true);
    this.recognition.start();
  }

  stop(): void {
    if (!this.recognition) {
      return;
    }
    this.recognition.stop();
  }
}
