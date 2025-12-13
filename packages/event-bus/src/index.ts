// =================================
// TEXTMESH EVENT BUS (KAFKA)
// =================================

import { Kafka, Producer, Consumer, EachMessagePayload, logLevel, SASLOptions } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import {
  EventType,
  BaseEvent,
  EventMetadata,
  EVENT_TOPICS,
  TextMeshEvent,
} from '@textmesh/shared-types';

export interface EventBusConfig {
  brokers: string[];
  clientId: string;
  groupId?: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

export type EventHandler<T = unknown> = (event: BaseEvent<EventType, T>) => Promise<void>;

export class EventBus {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private config: EventBusConfig;
  private serviceName: string;
  private isProducerConnected = false;
  private isConsumerConnected = false;

  constructor(config: EventBusConfig, serviceName: string) {
    this.config = config;
    this.serviceName = serviceName;

    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      ...(config.ssl !== undefined && { ssl: config.ssl }),
      ...(config.sasl && { sasl: config.sasl as SASLOptions }),
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  // Producer Methods
  async connectProducer(): Promise<void> {
    if (this.isProducerConnected) return;

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    await this.producer.connect();
    this.isProducerConnected = true;
    console.log(`[EventBus] Producer connected for ${this.serviceName}`);
  }

  async disconnectProducer(): Promise<void> {
    if (this.producer && this.isProducerConnected) {
      await this.producer.disconnect();
      this.isProducerConnected = false;
      console.log(`[EventBus] Producer disconnected for ${this.serviceName}`);
    }
  }

  async publish<T>(
    eventType: EventType,
    payload: T,
    options?: {
      correlationId?: string;
      userId?: string;
      topic?: string;
    }
  ): Promise<void> {
    if (!this.producer || !this.isProducerConnected) {
      await this.connectProducer();
    }

    const event: BaseEvent<EventType, T> = {
      id: uuidv4(),
      type: eventType,
      payload,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        source: this.serviceName,
        ...(options?.correlationId && { correlationId: options.correlationId }),
        ...(options?.userId && { userId: options.userId }),
      },
    };

    const topic = options?.topic || this.getTopicForEventType(eventType);

    await this.producer!.send({
      topic,
      messages: [
        {
          key: event.id,
          value: JSON.stringify(event),
          headers: {
            eventType,
            source: this.serviceName,
            timestamp: event.metadata.timestamp,
          },
        },
      ],
    });

    console.log(`[EventBus] Published event: ${eventType} to topic: ${topic}`);
  }

  async publishBatch<T>(
    events: Array<{
      eventType: EventType;
      payload: T;
      options?: { correlationId?: string; userId?: string };
    }>
  ): Promise<void> {
    if (!this.producer || !this.isProducerConnected) {
      await this.connectProducer();
    }

    const topicMessages: Map<string, Array<{ key: string; value: string; headers: Record<string, string> }>> = new Map();

    for (const { eventType, payload, options } of events) {
      const event: BaseEvent<EventType, T> = {
        id: uuidv4(),
        type: eventType,
        payload,
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          source: this.serviceName,
          ...(options?.correlationId && { correlationId: options.correlationId }),
          ...(options?.userId && { userId: options.userId }),
        },
      };

      const topic = this.getTopicForEventType(eventType);

      if (!topicMessages.has(topic)) {
        topicMessages.set(topic, []);
      }

      topicMessages.get(topic)!.push({
        key: event.id,
        value: JSON.stringify(event),
        headers: {
          eventType,
          source: this.serviceName,
          timestamp: event.metadata.timestamp,
        },
      });
    }

    const batch = Array.from(topicMessages.entries()).map(([topic, messages]) => ({
      topic,
      messages,
    }));

    await this.producer!.sendBatch({ topicMessages: batch });
    console.log(`[EventBus] Published batch of ${events.length} events`);
  }

  // Consumer Methods
  async connectConsumer(topics: string[]): Promise<void> {
    if (this.isConsumerConnected) return;

    if (!this.config.groupId) {
      throw new Error('Consumer requires a groupId');
    }

    this.consumer = this.kafka.consumer({
      groupId: this.config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await this.consumer.connect();

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    this.isConsumerConnected = true;
    console.log(`[EventBus] Consumer connected for ${this.serviceName}, subscribed to: ${topics.join(', ')}`);
  }

  async disconnectConsumer(): Promise<void> {
    if (this.consumer && this.isConsumerConnected) {
      await this.consumer.disconnect();
      this.isConsumerConnected = false;
      console.log(`[EventBus] Consumer disconnected for ${this.serviceName}`);
    }
  }

  on<T>(eventType: EventType, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler as EventHandler);
  }

  off(eventType: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async startConsuming(): Promise<void> {
    if (!this.consumer || !this.isConsumerConnected) {
      throw new Error('Consumer not connected');
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;

        if (!message.value) {
          console.warn(`[EventBus] Empty message received on topic: ${topic}`);
          return;
        }

        try {
          const event = JSON.parse(message.value.toString()) as TextMeshEvent;
          const eventType = event.type as EventType;

          console.log(`[EventBus] Received event: ${eventType} from topic: ${topic}, partition: ${partition}`);

          const handlers = this.handlers.get(eventType);
          if (handlers && handlers.length > 0) {
            await Promise.all(
              handlers.map((handler) =>
                handler(event).catch((error) => {
                  console.error(`[EventBus] Handler error for ${eventType}:`, error);
                })
              )
            );
          }
        } catch (error) {
          console.error(`[EventBus] Failed to process message:`, error);
        }
      },
    });

    console.log(`[EventBus] Consumer started for ${this.serviceName}`);
  }

  private getTopicForEventType(eventType: EventType): string {
    if (eventType.startsWith('user.') || eventType.startsWith('follow.')) {
      return EVENT_TOPICS.USERS;
    }
    if (eventType.startsWith('post.')) {
      return EVENT_TOPICS.POSTS;
    }
    if (eventType.startsWith('group.')) {
      return EVENT_TOPICS.GROUPS;
    }
    if (eventType.startsWith('notification.') || eventType.startsWith('push.')) {
      return EVENT_TOPICS.NOTIFICATIONS;
    }
    if (eventType.startsWith('report.')) {
      return EVENT_TOPICS.REPORTS;
    }
    if (eventType.startsWith('media.')) {
      return EVENT_TOPICS.MEDIA;
    }
    if (eventType.startsWith('compliance.')) {
      return EVENT_TOPICS.COMPLIANCE;
    }
    if (eventType.startsWith('analytics.')) {
      return EVENT_TOPICS.ANALYTICS;
    }
    return EVENT_TOPICS.USERS; // default
  }

  // Admin Methods
  async createTopics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();

    const topics = Object.values(EVENT_TOPICS).map((topic) => ({
      topic,
      numPartitions: 3,
      replicationFactor: 1,
    }));

    await admin.createTopics({ topics });
    await admin.disconnect();

    console.log('[EventBus] Topics created:', Object.values(EVENT_TOPICS).join(', '));
  }

  async deleteTopics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    await admin.deleteTopics({ topics: Object.values(EVENT_TOPICS) });
    await admin.disconnect();
  }

  // Graceful Shutdown
  async shutdown(): Promise<void> {
    await this.disconnectProducer();
    await this.disconnectConsumer();
  }
}

// Factory function
export function createEventBus(config: EventBusConfig, serviceName: string): EventBus {
  return new EventBus(config, serviceName);
}

// Helper to create event metadata
export function createEventMetadata(
  source: string,
  options?: { correlationId?: string; userId?: string }
): EventMetadata {
  return {
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    ...(options?.correlationId && { correlationId: options.correlationId }),
    ...(options?.userId && { userId: options.userId }),
  };
}

// Re-export types
export { EventType, EVENT_TOPICS, TextMeshEvent } from '@textmesh/shared-types';

// Alias for backward compatibility
export { EventType as EventTypes } from '@textmesh/shared-types';

// Convenience standalone publish function
let defaultEventBus: EventBus | null = null;

export function initializeEventBus(config: EventBusConfig, serviceName: string): EventBus {
  defaultEventBus = new EventBus(config, serviceName);
  return defaultEventBus;
}

export async function publishEvent<T>(eventType: EventType, payload: T, options?: { correlationId?: string; userId?: string }): Promise<void> {
  if (!defaultEventBus) {
    throw new Error('EventBus not initialized. Call initializeEventBus first.');
  }
  await defaultEventBus.publish(eventType, payload, options);
}

export default EventBus;

// Legacy convenience exports for backward compatibility
export async function connectKafka(): Promise<void> {
  if (!defaultEventBus) {
    console.warn('EventBus not initialized. Call initializeEventBus first.');
    return;
  }
  await defaultEventBus.connectProducer();
}

export async function disconnectKafka(): Promise<void> {
  if (defaultEventBus) {
    await defaultEventBus.shutdown();
  }
}

// Subscribe to event convenience function
export function subscribeToEvent<T>(
  eventType: EventType | string,
  handler: (data: T) => Promise<void>
): void {
  if (!defaultEventBus) {
    console.warn('EventBus not initialized. Call initializeEventBus first.');
    return;
  }
  defaultEventBus.on(eventType as EventType, async (event) => {
    await handler(event.payload as T);
  });
}
