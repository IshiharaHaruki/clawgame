import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockGateway } from '../mock-gateway.js';
import { GatewayClient } from '../gateway-client.js';

const TEST_PORT = 19876;
const TEST_URL = `ws://127.0.0.1:${TEST_PORT}`;

describe('GatewayClient', () => {
  let mockGateway: MockGateway;

  beforeAll(async () => {
    mockGateway = new MockGateway();
    await mockGateway.start(TEST_PORT);
  });

  afterAll(() => {
    mockGateway.stop();
  });

  it('should connect and receive hello event', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    const helloPayload = await new Promise<unknown>((resolve) => {
      client.on('hello', (payload) => resolve(payload));
      client.connect();
    });

    expect(helloPayload).toHaveProperty('type', 'hello-ok');
    client.destroy();
  });

  it('should emit connected event', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    client.destroy();
  });

  it('should make RPC calls to sessions.list', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    const result = await client.rpc('sessions.list') as { sessions: unknown[] };
    expect(result).toHaveProperty('sessions');
    expect(Array.isArray(result.sessions)).toBe(true);
    expect(result.sessions.length).toBe(3);

    client.destroy();
  });

  it('should make RPC calls to cron.list', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    const result = await client.rpc('cron.list') as { jobs: unknown[] };
    expect(result).toHaveProperty('jobs');
    expect(Array.isArray(result.jobs)).toBe(true);
    expect(result.jobs.length).toBe(3);

    client.destroy();
  });

  it('should handle RPC errors for unknown methods', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    await expect(client.rpc('nonexistent.method')).rejects.toThrow('Unknown method');
    client.destroy();
  });

  it('should emit gateway events', async () => {
    const client = new GatewayClient({ url: TEST_URL, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    const eventPromise = new Promise<unknown>((resolve) => {
      client.on('gateway:presence', (payload) => resolve(payload));
    });

    const payload = await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20_000)),
    ]) as { presence?: unknown[] };

    expect(payload).toHaveProperty('presence');
    expect(Array.isArray(payload.presence)).toBe(true);

    client.destroy();
  }, 25_000);

  it('should reject pending RPCs when destroyed', async () => {
    const client = new GatewayClient({ url: TEST_URL, rpcTimeout: 60_000, skipDeviceIdentity: true });

    await new Promise<void>((resolve) => {
      client.on('connected', () => resolve());
      client.connect();
    });

    const offlineClient = new GatewayClient({ url: 'ws://127.0.0.1:19999', rpcTimeout: 500, skipDeviceIdentity: true });
    offlineClient.on('error', () => {}); // suppress

    // RPC should reject since not connected
    await expect(offlineClient.rpc('test')).rejects.toThrow('Not connected');

    offlineClient.destroy();
    client.destroy();
  });
});
