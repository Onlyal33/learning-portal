import { JwtSecretProvider } from './jwtSecret.js';

const parameterName = '/learning-portal/test/jwt-secret';

beforeEach(() => {
  process.env.JWT_SECRET_PARAMETER = parameterName;
});

test('caches a successful read, refreshes exactly at the 60-second boundary, and observes rotation', async () => {
  let now = 100;
  const getParameter = jest.fn()
    .mockResolvedValueOnce({ Parameter: { Value: 'first' } })
    .mockResolvedValueOnce({ Parameter: { Value: 'rotated' } });
  const provider = new JwtSecretProvider({ clock: () => now, getParameter });

  await expect(provider.getJwtSecret()).resolves.toBe('first');
  now += 59_999;
  await expect(provider.getJwtSecret()).resolves.toBe('first');
  now += 1;
  await expect(provider.getJwtSecret()).resolves.toBe('rotated');
  expect(getParameter).toHaveBeenCalledTimes(2);
  expect(getParameter).toHaveBeenNthCalledWith(1, parameterName);
});

test('does not cache failures or blank parameter values', async () => {
  const getParameter = jest.fn()
    .mockRejectedValueOnce(new Error('SSM read failed'))
    .mockResolvedValueOnce({ Parameter: { Value: '   ' } })
    .mockResolvedValueOnce({ Parameter: { Value: 'usable' } });
  const provider = new JwtSecretProvider({ getParameter });

  await expect(provider.getJwtSecret()).rejects.toThrow('SSM read failed');
  expect(getParameter).toHaveBeenCalledTimes(1);
  await expect(provider.getJwtSecret()).rejects.toThrow('JWT secret value is unavailable');
  expect(getParameter).toHaveBeenCalledTimes(2);
  await expect(provider.getJwtSecret()).resolves.toBe('usable');
  expect(getParameter).toHaveBeenCalledTimes(3);
});

test('shares one in-flight cache miss across concurrent callers', async () => {
  let resolve!: (value: { Parameter: { Value: string } }) => void;
  const getParameter = jest.fn(() => new Promise<{ Parameter: { Value: string } }>((done) => { resolve = done; }));
  const provider = new JwtSecretProvider({ getParameter });
  const first = provider.getJwtSecret();
  const second = provider.getJwtSecret();

  expect(getParameter).toHaveBeenCalledTimes(1);
  resolve({ Parameter: { Value: 'shared' } });
  await expect(Promise.all([first, second])).resolves.toEqual(['shared', 'shared']);
});
