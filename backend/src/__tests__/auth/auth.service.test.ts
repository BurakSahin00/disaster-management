jest.mock('../../auth/auth.repository', () => ({
  authRepository: {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
  },
}));

jest.mock('../../auth/registration-requests.repository', () => ({
  registrationRequestsRepository: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    deleteById: jest.fn(),
    reject: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  config: { jwtSecret: 'test-secret' },
}));

import { authRepository } from '../../auth/auth.repository';
import { registrationRequestsRepository } from '../../auth/registration-requests.repository';
import {
  submitRegistrationRequest,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '../../auth/auth.service';

const mockFindUserByEmail = authRepository.findByEmail as jest.Mock;
const mockCreateUser = authRepository.create as jest.Mock;
const mockFindRequestByEmail = registrationRequestsRepository.findByEmail as jest.Mock;
const mockFindRequestById = registrationRequestsRepository.findById as jest.Mock;
const mockCreateRequest = registrationRequestsRepository.create as jest.Mock;
const mockListRequests = registrationRequestsRepository.list as jest.Mock;
const mockDeleteRequest = registrationRequestsRepository.deleteById as jest.Mock;
const mockRejectRequest = registrationRequestsRepository.reject as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('submitRegistrationRequest', () => {
  it('throws if password is shorter than 6 characters', async () => {
    await expect(submitRegistrationRequest('a@b.com', '123')).rejects.toThrow('en az 6');
  });

  it('throws if email already exists in the users table', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    await expect(submitRegistrationRequest('a@b.com', 'pass123')).rejects.toThrow('zaten kayıtlı');
  });

  it('throws if a pending request already exists for the email', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockFindRequestByEmail.mockResolvedValue({ id: 'r1', status: 'pending' });
    await expect(submitRegistrationRequest('a@b.com', 'pass123')).rejects.toThrow(
      'bekleyen bir talep',
    );
  });

  it('creates a request and returns a confirmation message', async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    mockFindRequestByEmail.mockResolvedValue(null);
    mockCreateRequest.mockResolvedValue({ id: 'r1' });

    const result = await submitRegistrationRequest('a@b.com', 'pass123');
    expect(result.message).toContain('bekleniyor');
    expect(mockCreateRequest).toHaveBeenCalledTimes(1);
  });
});

describe('approveRegistrationRequest', () => {
  it('throws if request is not found', async () => {
    mockFindRequestById.mockResolvedValue(null);
    await expect(approveRegistrationRequest('missing', 'analyst', 'admin')).rejects.toThrow(
      'Talep bulunamadı',
    );
  });

  it('throws if request is not pending', async () => {
    mockFindRequestById.mockResolvedValue({ id: 'r1', status: 'rejected' });
    await expect(approveRegistrationRequest('r1', 'analyst', 'admin')).rejects.toThrow(
      'zaten işleme',
    );
  });

  it('creates user with the chosen role and deletes the request', async () => {
    mockFindRequestById.mockResolvedValue({
      id: 'r1',
      email: 'user@test.com',
      password_hash: 'hashed',
      status: 'pending',
    });
    mockCreateUser.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      role: 'analyst',
      password_hash: 'hashed',
      created_at: new Date(),
    });
    mockDeleteRequest.mockResolvedValue(undefined);

    const result = await approveRegistrationRequest('r1', 'analyst', 'admin');
    expect(result.email).toBe('user@test.com');
    expect(result.role).toBe('analyst');
    expect(mockDeleteRequest).toHaveBeenCalledWith('r1');
  });
});

describe('rejectRegistrationRequest', () => {
  it('throws if request is not found', async () => {
    mockFindRequestById.mockResolvedValue(null);
    await expect(rejectRegistrationRequest('missing', 'admin')).rejects.toThrow(
      'Talep bulunamadı',
    );
  });

  it('throws if request is not pending', async () => {
    mockFindRequestById.mockResolvedValue({ id: 'r1', status: 'approved' });
    await expect(rejectRegistrationRequest('r1', 'admin')).rejects.toThrow('zaten işleme');
  });

  it('rejects the request and returns id + status', async () => {
    mockFindRequestById.mockResolvedValue({ id: 'r1', status: 'pending' });
    mockRejectRequest.mockResolvedValue({ id: 'r1', status: 'rejected' });

    const result = await rejectRegistrationRequest('r1', 'admin', 'Yetersiz bilgi');
    expect(result.status).toBe('rejected');
    expect(mockRejectRequest).toHaveBeenCalledWith({
      id: 'r1',
      reviewedBy: 'admin',
      reason: 'Yetersiz bilgi',
    });
  });
});

describe('listRegistrationRequests', () => {
  it('delegates to repository and returns rows', async () => {
    const rows = [{ id: 'r1', email: 'a@b.com', status: 'pending' }];
    mockListRequests.mockResolvedValue(rows);

    const result = await listRegistrationRequests('pending');
    expect(result).toEqual(rows);
    expect(mockListRequests).toHaveBeenCalledWith('pending');
  });
});
