import { describe, it, expect, vi } from 'vitest';
import { api, ApiClientError } from '../src/api/client';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api client', () => {
  it('unwraps successful envelopes', async () => {
    mockFetchOnce(200, { success: true, data: { hello: 'world' }, error: null });
    const data = await api.get<{ hello: string }>('/anything');
    expect(data).toEqual({ hello: 'world' });
  });

  it('throws ApiClientError with server-provided code and message', async () => {
    mockFetchOnce(403, { success: false, data: null, error: { code: 'FORBIDDEN', message: 'No way' } });
    await expect(api.get('/secret')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'No way',
    });
  });

  it('surfaces validation details', async () => {
    mockFetchOnce(400, {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'username: too short' },
    });
    let caught: unknown = null;
    try {
      await api.post('/register', {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).code).toBe('VALIDATION_ERROR');
  });

  it('sends credentials (cookies) with every request', async () => {
    const fetchMock = mockFetchOnce(200, { success: true, data: {}, error: null });
    await api.get('/me');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ credentials: 'include' });
  });
});
