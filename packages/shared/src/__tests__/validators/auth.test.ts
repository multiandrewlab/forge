import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, updateProfileSchema } from '../../validators/auth';
import type { RegisterInput, UpdateProfileInput } from '../../validators/auth';
import type { AuthTokens, AuthResponse } from '../../types/user';
import type { User } from '../../types/index';

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe('loginSchema', () => {
  it('should accept valid login input', () => {
    const input = { email: 'user@example.com', password: 'secret12' };
    const result = loginSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('should reject an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'secret12' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: 'secret12' });
    expect(result.success).toBe(false);
  });

  it('should reject a password shorter than 8 characters', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '1234567' });
    expect(result.success).toBe(false);
  });

  it('should accept a password of exactly 8 characters', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('should reject missing email', () => {
    const result = loginSchema.safeParse({ password: 'secret12' });
    expect(result.success).toBe(false);
  });

  it('should reject missing password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('should strip unknown properties', () => {
    const result = loginSchema.safeParse({
      email: 'a@b.com',
      password: 'secret12',
      extra: 'field',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ email: 'a@b.com', password: 'secret12' });
    }
  });
});

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe('registerSchema', () => {
  const validInput = {
    email: 'user@example.com',
    display_name: 'Test User',
    password: 'password1',
    confirm_password: 'password1',
  };

  // -- happy path --
  it('should accept valid registration input', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validInput);
    }
  });

  // -- email --
  it('should reject an invalid email', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'bad' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty email', () => {
    const result = registerSchema.safeParse({ ...validInput, email: '' });
    expect(result.success).toBe(false);
  });

  // -- display_name --
  it('should reject an empty display_name', () => {
    const result = registerSchema.safeParse({ ...validInput, display_name: '' });
    expect(result.success).toBe(false);
  });

  it('should accept a display_name of exactly 1 character', () => {
    const result = registerSchema.safeParse({ ...validInput, display_name: 'A' });
    expect(result.success).toBe(true);
  });

  it('should accept a display_name of exactly 100 characters', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      display_name: 'A'.repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it('should reject a display_name longer than 100 characters', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      display_name: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  // -- password complexity --
  it('should reject a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'pass1',
      confirm_password: 'pass1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password with only letters (no number)', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'abcdefgh',
      confirm_password: 'abcdefgh',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password with only numbers (no letter)', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: '12345678',
      confirm_password: '12345678',
    });
    expect(result.success).toBe(false);
  });

  it('should accept a password with mixed case letters and numbers', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'AbCdEf12',
      confirm_password: 'AbCdEf12',
    });
    expect(result.success).toBe(true);
  });

  it('should accept a password of exactly 8 characters with letter and number', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'abcdefg1',
      confirm_password: 'abcdefg1',
    });
    expect(result.success).toBe(true);
  });

  it('should accept a password with special characters, letters, and numbers', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'p@$$w0rd!',
      confirm_password: 'p@$$w0rd!',
    });
    expect(result.success).toBe(true);
  });

  // -- confirm_password --
  it('should reject when confirm_password does not match password', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      confirm_password: 'different1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing confirm_password', () => {
    const { confirm_password: _, ...noConfirm } = validInput;
    void _;
    const result = registerSchema.safeParse(noConfirm);
    expect(result.success).toBe(false);
  });

  // -- strip unknown --
  it('should strip unknown properties', () => {
    const result = registerSchema.safeParse({ ...validInput, extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validInput);
    }
  });

  // -- type inference check (compile-time, runtime assertion) --
  it('should produce the correct RegisterInput type shape', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      const data: RegisterInput = result.data;
      expect(data.email).toBe(validInput.email);
      expect(data.display_name).toBe(validInput.display_name);
      expect(data.password).toBe(validInput.password);
      expect(data.confirm_password).toBe(validInput.confirm_password);
    }
  });
});

// ---------------------------------------------------------------------------
// updateProfileSchema
// ---------------------------------------------------------------------------
describe('updateProfileSchema', () => {
  it('should accept an empty object (all fields optional)', () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a valid display_name', () => {
    const result = updateProfileSchema.safeParse({ display_name: 'New Name' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name).toBe('New Name');
    }
  });

  it('should reject an empty display_name when provided', () => {
    const result = updateProfileSchema.safeParse({ display_name: '' });
    expect(result.success).toBe(false);
  });

  it('should accept a display_name of exactly 1 character', () => {
    const result = updateProfileSchema.safeParse({ display_name: 'X' });
    expect(result.success).toBe(true);
  });

  it('should accept a display_name of exactly 100 characters', () => {
    const result = updateProfileSchema.safeParse({ display_name: 'Z'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('should reject a display_name longer than 100 characters', () => {
    const result = updateProfileSchema.safeParse({ display_name: 'Z'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept a valid avatar_url', () => {
    const result = updateProfileSchema.safeParse({
      avatar_url: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avatar_url).toBe('https://example.com/avatar.png');
    }
  });

  it('should accept null avatar_url', () => {
    const result = updateProfileSchema.safeParse({ avatar_url: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avatar_url).toBeNull();
    }
  });

  it('should reject an invalid avatar_url', () => {
    const result = updateProfileSchema.safeParse({ avatar_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('should accept both fields together', () => {
    const result = updateProfileSchema.safeParse({
      display_name: 'Updated',
      avatar_url: 'https://img.example.com/pic.jpg',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name).toBe('Updated');
      expect(result.data.avatar_url).toBe('https://img.example.com/pic.jpg');
    }
  });

  it('should strip unknown properties', () => {
    const result = updateProfileSchema.safeParse({
      display_name: 'Name',
      extra: 'field',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ display_name: 'Name' });
    }
  });

  it('should produce the correct UpdateProfileInput type shape', () => {
    const input = { display_name: 'Name', avatar_url: 'https://a.com/b.png' };
    const result = updateProfileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data: UpdateProfileInput = result.data;
      expect(data.display_name).toBe('Name');
      expect(data.avatar_url).toBe('https://a.com/b.png');
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level checks: AuthTokens, AuthResponse
// ---------------------------------------------------------------------------
describe('Auth types', () => {
  it('AuthTokens should have accessToken', () => {
    const tokens: AuthTokens = { accessToken: 'abc123' };
    expect(tokens.accessToken).toBe('abc123');
  });

  it('AuthResponse should have user and accessToken', () => {
    const user: User = {
      id: '1',
      email: 'a@b.com',
      displayName: 'Test',
      avatarUrl: null,
      authProvider: 'local',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const response: AuthResponse = { user, accessToken: 'token' };
    expect(response.user).toBe(user);
    expect(response.accessToken).toBe('token');
  });
});
