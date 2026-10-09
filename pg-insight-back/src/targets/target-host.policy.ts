import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

export interface ResolvedTargetHost {
  address: string;
  servername?: string;
}

const BLOCKED_RANGES: Array<[string, number, 'ipv4' | 'ipv6']> = [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
];

const INTERNAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
];

@Injectable()
export class TargetHostPolicy {
  private readonly blocked = new BlockList();
  private readonly allowPrivate: boolean;

  constructor(config: ConfigService) {
    for (const [network, prefix, family] of BLOCKED_RANGES) {
      this.blocked.addSubnet(network, prefix, family);
    }
    this.allowPrivate =
      config.get<string>('TARGET_ALLOW_PRIVATE_HOSTS') === 'true';
  }

  async resolve(host: string, trusted: boolean): Promise<ResolvedTargetHost> {
    const name = host.trim().toLowerCase().replace(/\.$/, '');
    const literal = isIP(name) !== 0;
    const servername = literal ? undefined : name;

    if (trusted || this.allowPrivate) {
      return { address: name, servername };
    }

    if (
      !literal &&
      (!name.includes('.') ||
        name === 'localhost' ||
        INTERNAL_SUFFIXES.some((suffix) => name.endsWith(suffix)))
    ) {
      throw this.rejected(host);
    }

    const addresses = literal
      ? [{ address: name, family: isIP(name) }]
      : await lookup(name, { all: true, verbatim: true }).catch(() => {
          throw new BadRequestException(`Cannot resolve host ${host}`);
        });

    if (
      addresses.length === 0 ||
      addresses.some(({ address, family }) =>
        this.blocked.check(address, family === 6 ? 'ipv6' : 'ipv4'),
      )
    ) {
      throw this.rejected(host);
    }

    return { address: addresses[0].address, servername };
  }

  private rejected(host: string): BadRequestException {
    return new BadRequestException(
      `Target host ${host} resolves to a private or internal address`,
    );
  }
}

export function withServername<T>(
  ssl: T,
  servername: string | undefined,
): T | (T & { servername: string }) {
  if (!servername || !ssl || typeof ssl !== 'object') return ssl;
  return { ...ssl, servername };
}
