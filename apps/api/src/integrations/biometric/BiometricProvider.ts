/**
 * Biometric device abstraction (PRD §25).
 *
 * The concrete protocol of the deployed machine is not known yet, so this
 * interface deliberately describes only what the application needs — a way to
 * pull punch events, check the device is reachable, and report status. No
 * vendor-specific endpoint, payload or SDK call is invented here.
 *
 * To support a real device, add an implementation of this interface under
 * `integrations/biometric/providers/` and register it in `index.ts`. Nothing
 * outside this folder should change.
 */

export interface BiometricPunch {
  /**
   * Stable identifier for this punch as issued by the device. This is the
   * deduplication key — without it, a re-sync would duplicate attendance.
   */
  recordId: string;
  /** The device-local user id, mapped to a student via biometric_mappings. */
  biometricUserId: string;
  /** When the punch happened, as reported by the device. */
  timestamp: Date;
  direction?: 'IN' | 'OUT';
  /** Anything else the device sent, stored verbatim for troubleshooting. */
  raw?: Record<string, unknown>;
}

export interface DeviceConnection {
  deviceIdentifier: string;
  apiEndpoint: string | null;
  ipAddress: string | null;
}

export interface DeviceStatusReport {
  reachable: boolean;
  message: string;
  deviceTime?: Date;
}

export interface BiometricProvider {
  readonly name: string;

  /** Fetches punches in the given window. Must be safe to call repeatedly. */
  syncAttendance(
    connection: DeviceConnection,
    since: Date,
    until: Date,
  ): Promise<BiometricPunch[]>;

  getDeviceStatus(connection: DeviceConnection): Promise<DeviceStatusReport>;

  testConnection(connection: DeviceConnection): Promise<DeviceStatusReport>;
}

/** Raised when a provider cannot talk to the device. */
export class BiometricProviderError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BiometricProviderError';
  }
}
