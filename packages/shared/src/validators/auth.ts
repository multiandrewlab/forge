import { z } from 'zod';

const PASSWORD_COMPLEXITY_REGEX = /(?=.*[a-zA-Z])(?=.*[0-9])/;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z
  .object({
    email: z.string().email(),
    display_name: z.string().min(1).max(100),
    password: z
      .string()
      .min(8)
      .regex(PASSWORD_COMPLEXITY_REGEX, 'Password must contain at least one letter and one number'),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
