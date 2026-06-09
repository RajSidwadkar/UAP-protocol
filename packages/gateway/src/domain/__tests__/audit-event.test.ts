import { describe, it, expect, vi } from 'vitest';
import { AuditEvent } from '../audit-event';
import { AuditEventBus, IAuditHandler } from '../../application/audit-event-bus';

describe('AuditEvent', () => {
  it('AuditEvent.create() should generate a valid ULID', () => {
    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });

    expect(event.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('AuditEvent.create() should set a timestamp within the last 500ms', () => {
    const start = Date.now();
    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });
    const now = Date.now();

    expect(event.timestamp).toBeGreaterThanOrEqual(start);
    expect(event.timestamp).toBeLessThanOrEqual(now);
    expect(now - event.timestamp).toBeLessThan(500);
  });

  it('AuditEvent.toJSON() should return a plain object with no functions', () => {
    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: { key: 'value' },
    });

    const json = event.toJSON();
    expect(typeof json).toBe('object');
    expect(json).not.toBeInstanceOf(AuditEvent);
    
    for (const value of Object.values(json)) {
      expect(typeof value).not.toBe('function');
    }
    
    expect(json.kind).toBe('GATEWAY_STARTED');
    expect(json.metadata).toEqual({ key: 'value' });
  });
});

describe('AuditEventBus', () => {
  it('should call all subscribed handlers on publish()', async () => {
    const bus = new AuditEventBus();
    const handler1: IAuditHandler = { handle: vi.fn().mockResolvedValue(undefined) };
    const handler2: IAuditHandler = { handle: vi.fn().mockResolvedValue(undefined) };

    bus.subscribe(handler1);
    bus.subscribe(handler2);

    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });

    bus.publish(event);

    expect(handler1.handle).toHaveBeenCalledWith(event);
    expect(handler2.handle).toHaveBeenCalledWith(event);
  });

  it('should not throw if a handler fails', () => {
    const bus = new AuditEventBus();
    const handler: IAuditHandler = { 
      handle: vi.fn().mockRejectedValue(new Error('Handler failed')) 
    };

    bus.subscribe(handler);

    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });

    // publish() is sync and should not throw or reject
    expect(() => bus.publish(event)).not.toThrow();
  });

  it('should continue calling other handlers if one fails', async () => {
    const bus = new AuditEventBus();
    const handler1: IAuditHandler = { 
      handle: vi.fn().mockRejectedValue(new Error('Handler 1 failed')) 
    };
    const handler2: IAuditHandler = { handle: vi.fn().mockResolvedValue(undefined) };

    bus.subscribe(handler1);
    bus.subscribe(handler2);

    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });

    bus.publish(event);

    expect(handler1.handle).toHaveBeenCalledWith(event);
    expect(handler2.handle).toHaveBeenCalledWith(event);
  });

  it('should not call unsubscribed handlers', () => {
    const bus = new AuditEventBus();
    const handler: IAuditHandler = { handle: vi.fn().mockResolvedValue(undefined) };

    bus.subscribe(handler);
    bus.unsubscribe(handler);

    const event = AuditEvent.create({
      kind: 'GATEWAY_STARTED',
      traceId: '0'.repeat(32),
      callerId: 'system',
      resource: 'gateway',
      outcome: 'success',
      metadata: {},
    });

    bus.publish(event);

    expect(handler.handle).not.toHaveBeenCalled();
  });
});
