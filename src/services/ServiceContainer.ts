export interface ServiceToken<T> {
  readonly key: symbol;
  readonly name: string;
  readonly __type?: T;
}

type ServiceFactory<T> = (container: ServiceContainer) => T;

interface ServiceProvider<T> {
  lifetime: 'singleton' | 'transient';
  factory: ServiceFactory<T>;
}

export function createServiceToken<T>(name: string): ServiceToken<T> {
  return {
    key: Symbol(name),
    name,
  };
}

export class ServiceContainer {
  private readonly providers = new Map<symbol, ServiceProvider<unknown>>();
  private readonly singletons = new Map<symbol, unknown>();

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this {
    this.providers.set(token.key, { lifetime: 'singleton', factory });
    this.singletons.delete(token.key);
    return this;
  }

  registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): this {
    this.providers.set(token.key, { lifetime: 'transient', factory });
    this.singletons.delete(token.key);
    return this;
  }

  registerValue<T>(token: ServiceToken<T>, value: T): this {
    this.providers.set(token.key, {
      lifetime: 'singleton',
      factory: () => value,
    });
    this.singletons.set(token.key, value);
    return this;
  }

  resolve<T>(token: ServiceToken<T>): T {
    const provider = this.providers.get(token.key) as ServiceProvider<T> | undefined;
    if (!provider) {
      throw new Error(`Service provider not registered: ${token.name}`);
    }

    if (provider.lifetime === 'transient') {
      return provider.factory(this);
    }

    if (!this.singletons.has(token.key)) {
      this.singletons.set(token.key, provider.factory(this));
    }

    return this.singletons.get(token.key) as T;
  }
}
