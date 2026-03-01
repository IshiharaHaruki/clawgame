import type { AgentCharacter } from '../AgentCharacter';
import type { AgentStatus } from '../../types';

type AgentState =
  | 'idle_at_coffee'
  | 'walking_to_desk'
  | 'working'
  | 'walking_to_coffee'
  | 'error_at_desk'
  | 'cron_at_desk'
  | 'offline';

export class AgentStateMachine {
  private state: AgentState = 'idle_at_coffee';
  private pendingTransition: AgentStatus | null = null;

  constructor(private character: AgentCharacter) {}

  getState(): AgentState {
    return this.state;
  }

  transition(targetStatus: AgentStatus): void {
    // If currently walking, store pending and let the walk complete handler redirect
    if (
      this.state === 'walking_to_desk' ||
      this.state === 'walking_to_coffee'
    ) {
      this.pendingTransition = targetStatus;
      return;
    }

    switch (targetStatus) {
      case 'working':
        if (this.isAtCoffee()) {
          this.walkToDesk(() => this.enterWorking());
        } else {
          this.enterWorking();
        }
        break;
      case 'idle':
        if (this.isAtDesk()) {
          this.walkToCoffee(() => this.enterIdle());
        } else {
          this.enterIdle();
        }
        break;
      case 'error':
        if (this.isAtCoffee()) {
          this.walkToDesk(() => this.enterError());
        } else {
          this.enterError();
        }
        break;
      case 'cron_running':
        if (this.isAtCoffee()) {
          this.walkToDesk(() => this.enterCron());
        } else {
          this.enterCron();
        }
        break;
      case 'offline':
        this.enterOffline();
        break;
    }
  }

  private isAtCoffee(): boolean {
    return this.state === 'idle_at_coffee' || this.state === 'offline';
  }

  private isAtDesk(): boolean {
    return (
      this.state === 'working' ||
      this.state === 'error_at_desk' ||
      this.state === 'cron_at_desk'
    );
  }

  private walkToDesk(onComplete: () => void): void {
    this.state = 'walking_to_desk';
    const dest = this.character.getDeskPos();
    this.character.walkTo(dest.x, dest.y, () => {
      // Check for pending transitions
      if (this.pendingTransition) {
        const pending = this.pendingTransition;
        this.pendingTransition = null;
        // We're now at desk - determine what to do
        if (pending === 'idle') {
          this.walkToCoffee(() => this.enterIdle());
        } else if (pending === 'working') {
          this.enterWorking();
        } else if (pending === 'error') {
          this.enterError();
        } else if (pending === 'cron_running') {
          this.enterCron();
        } else {
          this.enterOffline();
        }
      } else {
        onComplete();
      }
    });
  }

  private walkToCoffee(onComplete: () => void): void {
    this.state = 'walking_to_coffee';
    const dest = this.character.getCoffeePos();
    this.character.walkTo(dest.x, dest.y, () => {
      if (this.pendingTransition) {
        const pending = this.pendingTransition;
        this.pendingTransition = null;
        if (pending === 'idle') {
          this.enterIdle();
        } else if (
          pending === 'working' ||
          pending === 'error' ||
          pending === 'cron_running'
        ) {
          this.walkToDesk(() => {
            if (pending === 'working') this.enterWorking();
            else if (pending === 'error') this.enterError();
            else this.enterCron();
          });
        } else {
          this.enterOffline();
        }
      } else {
        onComplete();
      }
    });
  }

  private enterWorking(): void {
    this.state = 'working';
    this.character.playAnimation('type');
    this.character.setAlpha(1);
  }

  private enterIdle(): void {
    this.state = 'idle_at_coffee';
    this.character.playAnimation('sip');
    this.character.setAlpha(1);
  }

  private enterError(): void {
    this.state = 'error_at_desk';
    this.character.playAnimation('error');
    this.character.setAlpha(1);
  }

  private enterCron(): void {
    this.state = 'cron_at_desk';
    this.character.playAnimation('cron');
    this.character.setAlpha(1);
  }

  private enterOffline(): void {
    this.state = 'offline';
    this.character.playAnimation('idle');
    this.character.setAlpha(0.3);
  }
}
