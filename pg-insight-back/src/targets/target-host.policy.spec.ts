jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { TargetHostPolicy, withServername } from './target-host.policy';

const lookupMock = lookup as unknown as jest.Mock;

function policy(env: Record<string, string> = {}) {
  return new TargetHostPolicy({ get: (key: string) => env[key] } as never);
}

describe('TargetHostPolicy', () => {
  beforeEach(() => lookupMock.mockReset());

  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.18.0.2',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
  ])('rejects the internal address %s', async (host) => {
    await expect(policy().resolve(host, false)).rejects.toThrow(
      BadRequestException,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each([
    'ledgercore-db',
    'platform-db',
    'localhost',
    'db.localhost',
    'printer.local',
    'host.docker.internal',
  ])('rejects the internal name %s without resolving it', async (host) => {
    await expect(policy().resolve(host, false)).rejects.toThrow(
      'private or internal address',
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a public name that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);

    await expect(
      policy().resolve('db.attacker.example', false),
    ).rejects.toThrow('private or internal address');
  });

  it('rejects a name when any of its addresses is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '203.0.114.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);

    await expect(policy().resolve('mixed.example.com', false)).rejects.toThrow(
      'private or internal address',
    );
  });

  it('pins the connection to the resolved public address and keeps the name for TLS', async () => {
    lookupMock.mockResolvedValue([{ address: '34.64.10.20', family: 4 }]);

    await expect(policy().resolve('DB.Example.com.', false)).resolves.toEqual({
      address: '34.64.10.20',
      servername: 'db.example.com',
    });
  });

  it('accepts a public IP literal without a TLS server name', async () => {
    await expect(policy().resolve('34.64.10.20', false)).resolves.toEqual({
      address: '34.64.10.20',
      servername: undefined,
    });
  });

  it('reports a name that does not resolve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(
      policy().resolve('missing.example.com', false),
    ).rejects.toThrow('Cannot resolve host missing.example.com');
  });

  it('lets trusted owners and private deployments reach internal hosts', async () => {
    await expect(policy().resolve('ledgercore-db', true)).resolves.toEqual({
      address: 'ledgercore-db',
      servername: 'ledgercore-db',
    });
    await expect(
      policy({ TARGET_ALLOW_PRIVATE_HOSTS: 'true' }).resolve('10.0.0.5', false),
    ).resolves.toEqual({ address: '10.0.0.5', servername: undefined });
  });
});

describe('withServername', () => {
  it('adds the server name only to TLS option objects', () => {
    expect(
      withServername({ rejectUnauthorized: true }, 'db.example.com'),
    ).toEqual({ rejectUnauthorized: true, servername: 'db.example.com' });
    expect(withServername(false, 'db.example.com')).toBe(false);
    expect(withServername(undefined, 'db.example.com')).toBeUndefined();
    expect(withServername({ rejectUnauthorized: false }, undefined)).toEqual({
      rejectUnauthorized: false,
    });
  });
});
