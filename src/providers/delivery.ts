import * as Sentry from '@sentry/cloudflare';

// Core delivery provider interface
export interface DeliveryProvider {
  readonly name: string;
  send(message: DeliveryMessage): Promise<DeliveryResult>;
  getStatus(messageId: string): Promise<DeliveryStatus>;
  healthCheck(): Promise<boolean>;
}

// Message structure for delivery
export interface DeliveryMessage {
  to: string; // email or phone number
  subject?: string; // for email only
  content: string;
  messageId: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  deliveryMethod: 'email' | 'sms' | 'portal';
  metadata?: Record<string, any>;
}

// Result from delivery attempt
export interface DeliveryResult {
  success: boolean;
  messageId: string;
  externalId?: string; // Provider's tracking ID
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  timestamp: string;
  error?: string;
  retryAfter?: number; // seconds to wait before retry
  metadata?: Record<string, any>;
}

// Current delivery status
export interface DeliveryStatus {
  messageId: string;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'spam' | 'unsubscribed';
  timestamp: string;
  attempts: number;
  lastError?: string;
  externalId?: string;
  metadata?: Record<string, any>;
}

// Provider configuration
export interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number; // Lower number = higher priority for failover
  rateLimitPerMinute: number;
  retryAttempts: number;
  retryDelayMs: number;
  healthCheckUrl?: string;
  apiKey?: string;
  metadata?: Record<string, any>;
}

// No-op provider for development and testing
export class NoOpDeliveryProvider implements DeliveryProvider {
  readonly name = 'noop';
  
  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    console.log(`[NOOP DELIVERY] Simulating send:`, {
      to: message.to,
      subject: message.subject,
      method: message.deliveryMethod,
      messageId: message.messageId,
      priority: message.priority,
      contentLength: message.content.length
    });

    // Add Sentry breadcrumb for tracking
    Sentry.addBreadcrumb({
      category: 'delivery',
      message: 'No-op delivery simulation',
      level: 'info',
      data: {
        provider: 'noop',
        messageId: message.messageId,
        to: message.to,
        method: message.deliveryMethod,
        priority: message.priority
      }
    });

    // Simulate different outcomes based on message content for testing
    if (message.content.includes('test-failure')) {
      return {
        success: false,
        messageId: message.messageId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: 'Simulated delivery failure for testing',
        retryAfter: 300 // Retry after 5 minutes
      };
    }

    if (message.content.includes('test-delay')) {
      return {
        success: true,
        messageId: message.messageId,
        externalId: `noop-${crypto.randomUUID()}`,
        status: 'queued',
        timestamp: new Date().toISOString(),
        metadata: {
          simulatedDelay: true,
          estimatedDelivery: new Date(Date.now() + 60000).toISOString() // 1 minute
        }
      };
    }

    // Default successful delivery
    return {
      success: true,
      messageId: message.messageId,
      externalId: `noop-${crypto.randomUUID()}`,
      status: 'sent',
      timestamp: new Date().toISOString(),
      metadata: {
        simulation: true,
        provider: 'noop'
      }
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    console.log(`[NOOP DELIVERY] Getting status for messageId: ${messageId}`);

    // Simulate delivered status for no-op provider
    return {
      messageId,
      status: 'delivered',
      timestamp: new Date().toISOString(),
      attempts: 1,
      externalId: `noop-${messageId}`,
      metadata: {
        simulation: true,
        provider: 'noop',
        deliveredAt: new Date().toISOString()
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    console.log('[NOOP DELIVERY] Health check - always healthy');
    
    Sentry.addBreadcrumb({
      category: 'delivery',
      message: 'No-op provider health check',
      level: 'info',
      data: { provider: 'noop', healthy: true }
    });

    return true;
  }
}

// Stub provider for future SendGrid integration
export class SendGridProvider implements DeliveryProvider {
  readonly name = 'sendgrid';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    if (message.deliveryMethod !== 'email') {
      return {
        success: false,
        messageId: message.messageId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: 'SendGrid only supports email delivery'
      };
    }

    // TODO: Implement actual SendGrid API integration
    console.log('[SENDGRID] Would send email:', {
      to: message.to,
      subject: message.subject,
      messageId: message.messageId
    });

    return {
      success: false,
      messageId: message.messageId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: 'SendGrid integration not yet implemented'
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    // TODO: Implement SendGrid status checking
    return {
      messageId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      attempts: 0,
      lastError: 'SendGrid integration not yet implemented'
    };
  }

  async healthCheck(): Promise<boolean> {
    // TODO: Implement SendGrid health check
    return false;
  }
}

// Stub provider for future Twilio integration
export class TwilioProvider implements DeliveryProvider {
  readonly name = 'twilio';
  private accountSid: string;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
  }

  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    if (message.deliveryMethod !== 'sms') {
      return {
        success: false,
        messageId: message.messageId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: 'Twilio only supports SMS delivery'
      };
    }

    // TODO: Implement actual Twilio API integration
    console.log('[TWILIO] Would send SMS:', {
      to: message.to,
      messageId: message.messageId,
      contentLength: message.content.length
    });

    return {
      success: false,
      messageId: message.messageId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: 'Twilio integration not yet implemented'
    };
  }

  async getStatus(messageId: string): Promise<DeliveryStatus> {
    // TODO: Implement Twilio status checking
    return {
      messageId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      attempts: 0,
      lastError: 'Twilio integration not yet implemented'
    };
  }

  async healthCheck(): Promise<boolean> {
    // TODO: Implement Twilio health check
    return false;
  }
}

// Delivery provider manager with failover support
export class DeliveryProviderManager {
  private providers: Map<string, DeliveryProvider> = new Map();
  private configs: Map<string, ProviderConfig> = new Map();

  constructor() {
    // Initialize with no-op provider as default
    this.registerProvider('noop', new NoOpDeliveryProvider(), {
      name: 'noop',
      enabled: true,
      priority: 999, // Lowest priority (fallback)
      rateLimitPerMinute: 1000,
      retryAttempts: 0,
      retryDelayMs: 0
    });
  }

  registerProvider(name: string, provider: DeliveryProvider, config: ProviderConfig): void {
    this.providers.set(name, provider);
    this.configs.set(name, config);
    
    console.log(`[DELIVERY MANAGER] Registered provider: ${name}`, {
      enabled: config.enabled,
      priority: config.priority
    });

    Sentry.addBreadcrumb({
      category: 'delivery',
      message: 'Provider registered',
      level: 'info',
      data: {
        provider: name,
        enabled: config.enabled,
        priority: config.priority
      }
    });
  }

  getActiveProviders(): ProviderConfig[] {
    const activeConfigs = Array.from(this.configs.values())
      .filter(config => config.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    return activeConfigs;
  }

  async getProviderForDeliveryMethod(method: 'email' | 'sms' | 'portal'): Promise<DeliveryProvider | null> {
    const activeProviders = this.getActiveProviders();
    
    for (const config of activeProviders) {
      const provider = this.providers.get(config.name);
      if (!provider) continue;

      // Check if provider is healthy
      try {
        const isHealthy = await provider.healthCheck();
        if (isHealthy) {
          console.log(`[DELIVERY MANAGER] Selected provider: ${provider.name} for ${method}`);
          return provider;
        }
      } catch (error) {
        console.warn(`[DELIVERY MANAGER] Provider ${provider.name} health check failed:`, error);
        
        Sentry.addBreadcrumb({
          category: 'delivery',
          message: 'Provider health check failed',
          level: 'warning',
          data: {
            provider: provider.name,
            method,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    // Return no-op provider as ultimate fallback
    return this.providers.get('noop') || null;
  }

  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    const provider = await this.getProviderForDeliveryMethod(message.deliveryMethod);
    
    if (!provider) {
      const error = 'No healthy delivery provider available';
      console.error('[DELIVERY MANAGER]', error);
      
      Sentry.captureException(new Error(error), {
        extra: {
          messageId: message.messageId,
          deliveryMethod: message.deliveryMethod,
          to: message.to
        }
      });

      return {
        success: false,
        messageId: message.messageId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error
      };
    }

    try {
      console.log(`[DELIVERY MANAGER] Sending via ${provider.name}:`, {
        messageId: message.messageId,
        method: message.deliveryMethod,
        to: message.to,
        priority: message.priority
      });

      const result = await provider.send(message);
      
      Sentry.addBreadcrumb({
        category: 'delivery',
        message: 'Message sent via provider',
        level: result.success ? 'info' : 'error',
        data: {
          provider: provider.name,
          messageId: message.messageId,
          success: result.success,
          status: result.status,
          error: result.error
        }
      });

      return result;
    } catch (error) {
      console.error(`[DELIVERY MANAGER] Provider ${provider.name} send failed:`, error);
      
      Sentry.captureException(error, {
        extra: {
          provider: provider.name,
          messageId: message.messageId,
          deliveryMethod: message.deliveryMethod
        }
      });

      return {
        success: false,
        messageId: message.messageId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown provider error'
      };
    }
  }

  async getStatus(messageId: string, providerName?: string): Promise<DeliveryStatus | null> {
    if (providerName) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          return await provider.getStatus(messageId);
        } catch (error) {
          console.error(`[DELIVERY MANAGER] Status check failed for ${providerName}:`, error);
          return null;
        }
      }
    }

    // Try all active providers if no specific provider given
    const activeProviders = this.getActiveProviders();
    for (const config of activeProviders) {
      const provider = this.providers.get(config.name);
      if (!provider) continue;

      try {
        const status = await provider.getStatus(messageId);
        if (status.status !== 'pending') {
          return status;
        }
      } catch (error) {
        console.warn(`[DELIVERY MANAGER] Status check failed for ${provider.name}:`, error);
      }
    }

    return null;
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch (error) {
        console.error(`[DELIVERY MANAGER] Health check failed for ${name}:`, error);
        results[name] = false;
      }
    }

    return results;
  }
}

// Global delivery manager instance
export const deliveryManager = new DeliveryProviderManager();

// Initialize providers based on environment
export function initializeDeliveryProviders(env: any): void {
  console.log('[DELIVERY MANAGER] Initializing providers...');
  
  const providerType = env.DELIVERY_PROVIDER || 'noop';
  
  switch (providerType) {
    case 'sendgrid':
      if (env.SENDGRID_API_KEY) {
        deliveryManager.registerProvider('sendgrid', new SendGridProvider(env.SENDGRID_API_KEY), {
          name: 'sendgrid',
          enabled: true,
          priority: 1,
          rateLimitPerMinute: 100,
          retryAttempts: 3,
          retryDelayMs: 60000 // 1 minute
        });
      } else {
        console.warn('[DELIVERY MANAGER] SendGrid API key not configured, falling back to no-op');
      }
      break;
      
    case 'twilio':
      if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
        deliveryManager.registerProvider('twilio', new TwilioProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN), {
          name: 'twilio',
          enabled: true,
          priority: 1,
          rateLimitPerMinute: 100,
          retryAttempts: 3,
          retryDelayMs: 60000 // 1 minute
        });
      } else {
        console.warn('[DELIVERY MANAGER] Twilio credentials not configured, falling back to no-op');
      }
      break;
      
    case 'noop':
    default:
      console.log('[DELIVERY MANAGER] Using no-op provider for development');
      break;
  }
  
  Sentry.addBreadcrumb({
    category: 'delivery',
    message: 'Delivery providers initialized',
    level: 'info',
    data: {
      providerType,
      hasApiKeys: {
        sendgrid: !!env.SENDGRID_API_KEY,
        twilio: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN)
      }
    }
  });
}
