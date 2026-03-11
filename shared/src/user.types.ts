// All roles a user account can hold
// 'creator' is the default - a logged-in user who can build and host games
// 'admin' is reserved for future moderation or management features
export type UserRole = "creator" | "admin";

// The full internal representation of a user.
// This shape is used server-side only and should never be sent to the client.
export interface User {
  id: number;
  email: string;
  displayName: string;
  passwordHash: string; // bcrypt hash - never exposed to client
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// The safe public representation of a user - no sensitive fields
// This is what gets sent in API responses and embedded in JWT payloads
export interface PublicUser {
  id: number;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

// Request body for updating a user's own profile
export interface UpdateProfileRequest {
  displayName?: string; // optional - only fields provided are updated
}

// Request body for changing a password.
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Aggregated stats for a user's profile page.
export interface UserStats {
  gamesCreated: number;
  categoriesCreated: number;
  questionsCreated: number;
  sessionsPlayed: number;
}
