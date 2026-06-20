import { pool } from '../db';

export interface RegistrationRequestRow {
  id: string;
  email: string;
  password_hash: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: Date;
  reviewed_at: Date | null;
  reviewed_by: string | null;
}

const COLS = 'id, email, password_hash, status, rejection_reason, created_at, reviewed_at, reviewed_by';

export const registrationRequestsRepository = {
  async create(input: {
    id: string;
    email: string;
    passwordHash: string;
  }): Promise<RegistrationRequestRow> {
    const { rows } = await pool.query<RegistrationRequestRow>(
      `INSERT INTO registration_requests (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING ${COLS}`,
      [input.id, input.email, input.passwordHash],
    );
    return rows[0]!;
  },

  async findByEmail(email: string): Promise<RegistrationRequestRow | null> {
    const { rows } = await pool.query<RegistrationRequestRow>(
      `SELECT ${COLS} FROM registration_requests WHERE email = $1 AND status = 'pending'`,
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<RegistrationRequestRow | null> {
    const { rows } = await pool.query<RegistrationRequestRow>(
      `SELECT ${COLS} FROM registration_requests WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async list(status?: string): Promise<RegistrationRequestRow[]> {
    if (status) {
      const { rows } = await pool.query<RegistrationRequestRow>(
        `SELECT ${COLS} FROM registration_requests WHERE status = $1 ORDER BY created_at DESC`,
        [status],
      );
      return rows;
    }
    const { rows } = await pool.query<RegistrationRequestRow>(
      `SELECT ${COLS} FROM registration_requests ORDER BY created_at DESC`,
    );
    return rows;
  },

  async deleteById(id: string): Promise<void> {
    await pool.query('DELETE FROM registration_requests WHERE id = $1', [id]);
  },

  async reject(input: {
    id: string;
    reviewedBy: string;
    reason?: string;
  }): Promise<RegistrationRequestRow> {
    const { rows } = await pool.query<RegistrationRequestRow>(
      `UPDATE registration_requests
       SET status = 'rejected',
           rejection_reason = $2,
           reviewed_at = NOW(),
           reviewed_by = $3
       WHERE id = $1
       RETURNING ${COLS}`,
      [input.id, input.reason ?? null, input.reviewedBy],
    );
    return rows[0]!;
  },
};
