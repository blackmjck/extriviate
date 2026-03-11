import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import type { UserStats, UpdateProfileRequest } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-profile',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);

  readonly user = this.auth.currentUser;
  readonly stats = signal<UserStats | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly editingName = signal(false);
  readonly savingName = signal(false);
  readonly nameError = signal<string | null>(null);

  readonly nameForm: FormGroup = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(50)]],
  });

  ngOnInit(): void {
    void this.loadStats();
  }

  startEditName(): void {
    this.nameForm.patchValue({ displayName: this.user()?.displayName ?? '' });
    this.nameError.set(null);
    this.editingName.set(true);
  }

  cancelEditName(): void {
    this.editingName.set(false);
    this.nameError.set(null);
  }

  async saveDisplayName(): Promise<void> {
    if (this.nameForm.invalid) return;
    const displayName = (this.nameForm.value.displayName as string).trim();
    if (!displayName) return;

    this.savingName.set(true);
    this.nameError.set(null);
    try {
      const body: UpdateProfileRequest = { displayName };
      const res = await this.userService.updateProfile(body);
      this.auth.currentUser.set(res.data);
      this.cancelEditName();
    } catch {
      this.nameError.set('Failed to update display name.');
    } finally {
      this.savingName.set(false);
    }
  }

  private async loadStats(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.userService.getStats();
      this.stats.set(res.data);
    } catch {
      this.error.set('Could not load profile stats.');
    } finally {
      this.loading.set(false);
    }
  }
}
