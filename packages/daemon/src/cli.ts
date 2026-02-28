#!/usr/bin/env node

import { Daemon } from './daemon.js';

const DEFAULT_PORT = 3333;
const DEFAULT_GATEWAY = 'ws://127.0.0.1:18789';

function parseArgs(argv: string[]): { command: string; flags: Record<string, string | boolean> } {
  const args = argv.slice(2);
  const command = args.find((a) => !a.startsWith('-')) ?? 'start';
  const flags: Record<string, string | boolean> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }

  return { command, flags };
}

async function cmdStart(flags: Record<string, string | boolean>): Promise<void> {
  const port = typeof flags.port === 'string' ? parseInt(flags.port, 10) : DEFAULT_PORT;
  const gatewayUrl = typeof flags.gateway === 'string' ? flags.gateway : DEFAULT_GATEWAY;
  const mock = flags.mock === true;

  const effectiveGatewayUrl = mock ? `ws://127.0.0.1:${port + 1}` : gatewayUrl;

  const daemon = new Daemon({ port, gatewayUrl: effectiveGatewayUrl, mock });
  const url = await daemon.start();

  console.log(`ClawGame running at ${url}`);
  if (mock) console.log('(using mock gateway)');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await daemon.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function cmdStop(): void {
  const state = Daemon.readStateFile();
  if (!state) {
    console.log('No running daemon found.');
    process.exit(1);
  }

  try {
    process.kill(state.pid, 'SIGTERM');
    console.log(`Sent SIGTERM to daemon (PID ${state.pid}).`);
  } catch (err) {
    console.log(`Could not kill PID ${state.pid}: ${(err as Error).message}`);
    process.exit(1);
  }
}

function cmdStatus(): void {
  const state = Daemon.readStateFile();
  if (!state) {
    console.log('No running daemon found.');
    process.exit(1);
  }

  // Check if process is alive
  let alive = false;
  try {
    process.kill(state.pid, 0);
    alive = true;
  } catch {
    alive = false;
  }

  console.log(`PID:     ${state.pid} (${alive ? 'running' : 'not running'})`);
  console.log(`URL:     ${state.url}`);
  console.log(`Port:    ${state.port}`);
  console.log(`Version: ${state.version}`);
}

async function cmdOpen(): Promise<void> {
  const state = Daemon.readStateFile();
  if (!state) {
    console.log('No running daemon found.');
    process.exit(1);
  }

  const open = (await import('open')).default;
  await open(state.url);
  console.log(`Opened ${state.url}`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'start':
      await cmdStart(flags);
      break;
    case 'stop':
      cmdStop();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'open':
      await cmdOpen();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: clawgame [start|stop|status|open] [--mock] [--port=3333] [--gateway=ws://...]');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
