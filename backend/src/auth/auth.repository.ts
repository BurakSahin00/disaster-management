import { pool } from '../db';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'analyst' | 'viewer';
  created_at: Date;
}

export interface UserPublicRow {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  created_at: Date;
}

export const authRepository = {
  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      'SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1',
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      'SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: {
    id: string;
    email: string;
    passwordHash: string;
    role: 'admin' | 'analyst' | 'viewer';
  }): Promise<UserRow> {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, password_hash, role, created_at`,
      [input.id, input.email, input.passwordHash, input.role],
    );
    return rows[0]!;
  },

  async findAll(): Promise<UserPublicRow[]> {
    const { rows } = await pool.query<UserPublicRow>(
      'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC',
    );
    return rows;
  },
};
