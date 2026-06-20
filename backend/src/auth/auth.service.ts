import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { authRepository, type UserRow, type UserPublicRow } from './auth.repository';
import {
  registrationRequestsRepository,
  type RegistrationRequestRow,
} from './registration-requests.repository';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthResult {
  token: string;
  user: { id: string; email: string; role: string };
}

function signToken(user: UserRow): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role } satisfies TokenPayload,
    config.jwtSecret,
    { expiresIn: '7d' },
  );
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await authRepository.findByEmail(email.toLowerCase().trim());
  if (!user) throw new Error('Geçersiz e-posta veya şifre');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Geçersiz e-posta veya şifre');

  return { token: signToken(user), user: { id: user.id, email: user.email, role: user.role } };
}

export async function registerUser(
  email: string,
  password: string,
  role: 'admin' | 'analyst' | 'viewer' = 'viewer',
): Promise<AuthResult> {
  const existing = await authRepository.findByEmail(email.toLowerCase().trim());
  if (existing) throw new Error('Bu e-posta adresi zaten kayıtlı');

  if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await authRepository.create({
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role,
  });

  return { token: signToken(user), user: { id: user.id, email: user.email, role: user.role } };
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

export async function submitRegistrationRequest(
  email: string,
  password: string,
): Promise<{ message: string }> {
  if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır');

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await authRepository.findByEmail(normalizedEmail);
  if (existingUser) throw new Error('Bu e-posta adresi zaten kayıtlı');

  const pendingRequest = await registrationRequestsRepository.findByEmail(normalizedEmail);
  if (pendingRequest) throw new Error('Bu e-posta için bekleyen bir talep var');

  const passwordHash = await bcrypt.hash(password, 10);
  await registrationRequestsRepository.create({
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
  });

  return { message: 'Talebiniz alındı, admin onayı bekleniyor.' };
}

export async function listRegistrationRequests(
  status?: string,
): Promise<RegistrationRequestRow[]> {
  return registrationRequestsRepository.list(status);
}

export async function listUsers(): Promise<UserPublicRow[]> {
  return authRepository.findAll();
}

export async function approveRegistrationRequest(
  id: string,
  role: 'admin' | 'analyst' | 'viewer',
  _reviewedBy: string,
): Promise<{ id: string; email: string; role: string }> {
  const request = await registrationRequestsRepository.findById(id);
  if (!request) throw new Error('Talep bulunamadı');
  if (request.status !== 'pending') throw new Error('Bu talep zaten işleme alınmış');

  const user = await authRepository.create({
    id: crypto.randomUUID(),
    email: request.email,
    passwordHash: request.password_hash,
    role,
  });

  await registrationRequestsRepository.deleteById(id);

  return { id: user.id, email: user.email, role: user.role };
}

export async function rejectRegistrationRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): Promise<{ id: string; status: string }> {
  const request = await registrationRequestsRepository.findById(id);
  if (!request) throw new Error('Talep bulunamadı');
  if (request.status !== 'pending') throw new Error('Bu talep zaten işleme alınmış');

  const updated = await registrationRequestsRepository.reject({ id, reviewedBy, reason });
  return { id: updated.id, status: updated.status };
}
