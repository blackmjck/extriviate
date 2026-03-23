// Global Angular test environment initialisation.
// Runs once before all spec files via vitest.config.ts `setupFiles`.
//
// This project is zoneless — do NOT import zone.js here.
// Each spec that needs change detection should configure:
//   TestBed.configureTestingModule({
//     providers: [provideExperimentalZonelessChangeDetection()],
//   });

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
