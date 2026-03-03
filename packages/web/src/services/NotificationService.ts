const THROTTLE_MS = 5000;

class NotificationServiceImpl {
  private lastNotifyAt = 0;
  private permitted = false;

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      this.permitted = true;
      return true;
    }
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    this.permitted = result === 'granted';
    return this.permitted;
  }

  notify(title: string, body: string): void {
    if (!this.permitted) return;
    if (document.hasFocus()) return;
    const now = Date.now();
    if (now - this.lastNotifyAt < THROTTLE_MS) return;
    this.lastNotifyAt = now;
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export const NotificationService = new NotificationServiceImpl();
