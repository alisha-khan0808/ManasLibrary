import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Notification abstraction (PRD §21).
 *
 * No third-party provider is hard-coded. WhatsApp/SMS/email can be added later
 * as additional implementations without touching the reminder job.
 */

export interface NotificationMessage {
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  delivered: boolean;
  provider: string;
  error?: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
}

/** Discards messages. Used when reminders should be generated but not sent. */
class NoopNotificationProvider implements NotificationProvider {
  readonly name = 'none';

  async send(): Promise<NotificationResult> {
    return { delivered: false, provider: this.name, error: 'No provider configured' };
  }
}

/**
 * Writes the message to the application log. The default for development and
 * for a first production rollout where reminders are reviewed before any
 * external channel is wired up.
 */
class LogNotificationProvider implements NotificationProvider {
  readonly name = 'log';

  async send(message: NotificationMessage): Promise<NotificationResult> {
    logger.info(
      { recipient: message.recipient, body: message.body },
      'Fee reminder (log provider)',
    );
    return { delivered: true, provider: this.name };
  }
}

/**
 * Posts to a configured HTTP endpoint. Lets the project point at whichever
 * channel it has contracted without this codebase knowing the vendor.
 */
class WebhookNotificationProvider implements NotificationProvider {
  readonly name = 'webhook';

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const url = env.NOTIFICATION_API_URL;

    if (!url) {
      return { delivered: false, provider: this.name, error: 'NOTIFICATION_API_URL is not set' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(env.NOTIFICATION_API_KEY
            ? { Authorization: `Bearer ${env.NOTIFICATION_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          to: message.recipient,
          subject: message.subject,
          message: message.body,
          metadata: message.metadata,
        }),
      });

      if (!response.ok) {
        return {
          delivered: false,
          provider: this.name,
          error: `Provider responded with status ${response.status}`,
        };
      }

      return { delivered: true, provider: this.name };
    } catch (error) {
      return {
        delivered: false,
        provider: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

let instance: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  if (!instance) {
    switch (env.NOTIFICATION_PROVIDER) {
      case 'webhook':
        instance = new WebhookNotificationProvider();
        break;
      case 'log':
        instance = new LogNotificationProvider();
        break;
      default:
        instance = new NoopNotificationProvider();
    }
    logger.info({ provider: instance.name }, 'Notification provider initialised');
  }
  return instance;
}
