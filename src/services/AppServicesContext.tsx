'use client';

import { EditorAiService } from 'ai/editor-ai.service';
import { TemplateAiService } from 'ai/template-ai.service';
import { createContext, type ReactNode, useMemo } from 'react';
import { AuthService } from 'services/AuthService';
import { FetchHttpClient, type HttpClient } from 'services/http/HttpClient';
import { SearchService } from 'services/SearchService';
import { createServiceToken, ServiceContainer, type ServiceToken } from 'services/ServiceContainer';
import { TemplateService } from 'services/TemplateService';
import { UserService } from 'services/UserService';

interface AppServices {
  authService: AuthService;
  userService: UserService;
  searchService: SearchService;
  templateService: TemplateService;
  templateAiService: TemplateAiService;
  editorAiService: EditorAiService;
}

type AuthExpiredHandler = () => void;

const APP_SERVICE_TOKENS = {
  authService: createServiceToken<AuthService>('AuthService'),
  httpClient: createServiceToken<HttpClient>('HttpClient'),
  authExpiredHandler: createServiceToken<AuthExpiredHandler>('AuthExpiredHandler'),
  userService: createServiceToken<UserService>('UserService'),
  searchService: createServiceToken<SearchService>('SearchService'),
  templateService: createServiceToken<TemplateService>('TemplateService'),
  templateAiService: createServiceToken<TemplateAiService>('TemplateAiService'),
  editorAiService: createServiceToken<EditorAiService>('EditorAiService'),
} as const;

const AppServicesContext = createContext<AppServices | null>(null);

export function createAppServiceContainer(
  configure?: (container: ServiceContainer, tokens: typeof APP_SERVICE_TOKENS) => void,
): ServiceContainer {
  const container = new ServiceContainer();

  container.registerSingleton(APP_SERVICE_TOKENS.authService, () => new AuthService());
  container.registerSingleton(
    APP_SERVICE_TOKENS.httpClient,
    (services) => new FetchHttpClient(() => services.resolve(APP_SERVICE_TOKENS.authService).getToken()),
  );
  container.registerSingleton(APP_SERVICE_TOKENS.authExpiredHandler, (services) => {
    return () => {
      const authService = services.resolve(APP_SERVICE_TOKENS.authService);
      authService.clear();
      window.location.assign('/');
    };
  });

  container.registerSingleton(
    APP_SERVICE_TOKENS.userService,
    (services) => new UserService(services.resolve(APP_SERVICE_TOKENS.httpClient)),
  );
  container.registerSingleton(
    APP_SERVICE_TOKENS.searchService,
    (services) => new SearchService(services.resolve(APP_SERVICE_TOKENS.httpClient)),
  );
  container.registerSingleton(
    APP_SERVICE_TOKENS.templateService,
    (services) => new TemplateService(services.resolve(APP_SERVICE_TOKENS.httpClient)),
  );
  container.registerSingleton(
    APP_SERVICE_TOKENS.templateAiService,
    (services) =>
      new TemplateAiService(
        () => services.resolve(APP_SERVICE_TOKENS.authService).getToken(),
        services.resolve(APP_SERVICE_TOKENS.authExpiredHandler),
        services.resolve(APP_SERVICE_TOKENS.httpClient),
      ),
  );
  container.registerSingleton(
    APP_SERVICE_TOKENS.editorAiService,
    (services) =>
      new EditorAiService(
        () => services.resolve(APP_SERVICE_TOKENS.authService).getToken(),
        services.resolve(APP_SERVICE_TOKENS.authExpiredHandler),
        services.resolve(APP_SERVICE_TOKENS.httpClient),
      ),
  );

  configure?.(container, APP_SERVICE_TOKENS);
  return container;
}

export function createAppServices(container: ServiceContainer = createAppServiceContainer()): AppServices {
  return {
    authService: container.resolve(APP_SERVICE_TOKENS.authService),
    userService: container.resolve(APP_SERVICE_TOKENS.userService),
    searchService: container.resolve(APP_SERVICE_TOKENS.searchService),
    templateService: container.resolve(APP_SERVICE_TOKENS.templateService),
    templateAiService: container.resolve(APP_SERVICE_TOKENS.templateAiService),
    editorAiService: container.resolve(APP_SERVICE_TOKENS.editorAiService),
  };
}

export function AppServicesProvider({
  children,
  services,
  container,
}: {
  children: ReactNode;
  services?: AppServices;
  container?: ServiceContainer;
}) {
  const resolvedServices = useMemo<AppServices>(() => {
    return services ?? createAppServices(container ?? createAppServiceContainer());
  }, [container, services]);

  return <AppServicesContext.Provider value={resolvedServices}>{children}</AppServicesContext.Provider>;
}

export { AppServicesContext };
export { APP_SERVICE_TOKENS };
export type { AppServices, ServiceToken };
