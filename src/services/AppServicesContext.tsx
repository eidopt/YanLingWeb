'use client';

import { EditorAiService } from 'ai/editor-ai.service';
import { TemplateAiService } from 'ai/template-ai.service';
import {
  createContext,
  type ReactNode,
  useMemo,
} from 'react';
import { AuthService } from 'services/AuthService';
import { SearchService } from 'services/SearchService';
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

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children }: { children: ReactNode }) {
  const services = useMemo<AppServices>(() => {
    const authService = new AuthService();

    const handleAuthExpired = () => {
      authService.clear();
      window.location.assign('/');
    };

    return {
      authService,
      userService: new UserService(() => authService.getToken()),
      searchService: new SearchService(() => authService.getToken()),
      templateService: new TemplateService(() => authService.getToken()),
      templateAiService: new TemplateAiService(
        () => authService.getToken(),
        handleAuthExpired,
      ),
      editorAiService: new EditorAiService(
        () => authService.getToken(),
        handleAuthExpired,
      ),
    };
  }, []);

  return (
    <AppServicesContext.Provider value={services}>
      {children}
    </AppServicesContext.Provider>
  );
}

export { AppServicesContext };
export type { AppServices };
