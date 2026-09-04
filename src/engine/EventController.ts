type EventTargetLike = Window | Document | HTMLElement;
type EventMapFor<T extends EventTargetLike> =
  T extends Window ? WindowEventMap :
  T extends Document ? DocumentEventMap :
  HTMLElementEventMap;

interface ListenerRecord {
  target: EventTargetLike;
  type: string;
  listener: EventListener;
  options?: AddEventListenerOptions | boolean;
}

export class EventController {
  private _listeners: ListenerRecord[] = [];

  public on<T extends EventTargetLike, K extends keyof EventMapFor<T>>(
    target: T,
    type: K,
    listener: (event: EventMapFor<T>[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ) {
    const eventType = String(type);
    const wrapped: EventListener = event => {
      listener(event as EventMapFor<T>[K]);
    };

    target.addEventListener(eventType, wrapped, options);
    this._listeners.push({ target, type: eventType, listener: wrapped, options });

    return () => {
      target.removeEventListener(eventType, wrapped, options);
      this._listeners = this._listeners.filter(record =>
        record.target !== target ||
        record.type !== eventType ||
        record.listener !== wrapped ||
        record.options !== options,
      );
    };
  }

  public dispose() {
    this._listeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this._listeners = [];
  }
}
