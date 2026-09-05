import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  BiometricProviderError,
  type BiometricProvider,
  type BiometricPunch,
  type DeviceConnection,
  type DeviceStatusReport,
} from './BiometricProvider';

/**
 * Default provider. Reports "not configured" rather than pretending to sync,
 * so an unconfigured deployment fails visibly instead of silently recording
 * nothing.
 */
class NullBiometricProvider implements BiometricProvider {
  readonly name = 'none';

  async syncAttendance(): Promise<BiometricPunch[]> {
    throw new BiometricProviderError(
      'No biometric provider is configured. Set BIOMETRIC_PROVIDER once the device API is known.',
    );
  }

  async getDeviceStatus(): Promise<DeviceStatusReport> {
    return { reachable: false, message: 'No biometric provider configured.' };
  }

  async testConnection(): Promise<DeviceStatusReport> {
    return this.getDeviceStatus();
  }
}

/**
 * Generic HTTP provider.
 *
 * This speaks a small JSON contract of our own definition (documented in
 * docs/BIOMETRIC_INTEGRATION.md), suitable for a device that exposes an HTTP
 * API or sits behind a vendor-supplied middleware. It is NOT a guess at any
 * particular manufacturer's protocol — when the real device is known, either
 * point its middleware at this contract or add a dedicated provider.
 */
class HttpBiometricProvider implements BiometricProvider {
  readonly name = 'http';

  private endpointFor(connection: DeviceConnection, path: string): string {
    const base = connection.apiEndpoint ?? env.BIOMETRIC_API_URL;
    if (!base) {
      throw new BiometricProviderError(
        `Device ${connection.deviceIdentifier} has no api_endpoint and BIOMETRIC_API_URL is unset.`,
      );
    }
    return `${base.replace(/\/$/, '')}${path}`;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(env.BIOMETRIC_API_KEY
            ? { Authorization: `Bearer ${env.BIOMETRIC_API_KEY}` }
            : {}),
          ...(init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        throw new BiometricProviderError(
          `Device request failed with status ${response.status}.`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BiometricProviderError) throw error;
      throw new BiometricProviderError('Could not reach the biometric device.', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async syncAttendance(
    connection: DeviceConnection,
    since: Date,
    until: Date,
  ): Promise<BiometricPunch[]> {
    const url = new URL(this.endpointFor(connection, '/attendance'));
    url.searchParams.set('deviceId', connection.deviceIdentifier);
    url.searchParams.set('since', since.toISOString());
    url.searchParams.set('until', until.toISOString());

    const payload = await this.request<{
      records?: Array<{
        recordId?: string;
        biometricUserId?: string;
        timestamp?: string;
        direction?: string;
        [key: string]: unknown;
      }>;
    }>(url.toString());

    const records = payload.records ?? [];
    const punches: BiometricPunch[] = [];

    for (const record of records) {
      // A record without a stable id cannot be deduplicated, so it is dropped
      // rather than risking duplicate attendance on the next sync.
      if (!record.recordId || !record.biometricUserId || !record.timestamp) {
        logger.warn({ record }, 'Skipping biometric record with missing required fields');
        continue;
      }

      const timestamp = new Date(record.timestamp);
      if (Number.isNaN(timestamp.getTime())) {
        logger.warn({ record }, 'Skipping biometric record with an unparseable timestamp');
        continue;
      }

      punches.push({
        recordId: String(record.recordId),
        biometricUserId: String(record.biometricUserId),
        timestamp,
        direction: record.direction === 'OUT' ? 'OUT' : record.direction === 'IN' ? 'IN' : undefined,
        raw: record,
      });
    }

    return punches;
  }

  async getDeviceStatus(connection: DeviceConnection): Promise<DeviceStatusReport> {
    try {
      const payload = await this.request<{ status?: string; time?: string }>(
        this.endpointFor(connection, '/status'),
      );
      return {
        reachable: payload.status === 'ok',
        message: payload.status ?? 'unknown',
        deviceTime: payload.time ? new Date(payload.time) : undefined,
      };
    } catch (error) {
      return {
        reachable: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async testConnection(connection: DeviceConnection): Promise<DeviceStatusReport> {
    return this.getDeviceStatus(connection);
  }
}

let instance: BiometricProvider | null = null;

export function getBiometricProvider(): BiometricProvider {
  if (!instance) {
    instance =
      env.BIOMETRIC_PROVIDER === 'http'
        ? new HttpBiometricProvider()
        : new NullBiometricProvider();
    logger.info({ provider: instance.name }, 'Biometric provider initialised');
  }
  return instance;
}

export { NullBiometricProvider, HttpBiometricProvider };
