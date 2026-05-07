'use client';

import { EditorAiService } from 'ai/editor-ai.service';
import { TemplateAiService } from 'ai/template-ai.service';
import {
  createContext,
  type ReactNode,
  useMemo,
} from 'react';
import { AuthService } from 'services/AuthService';
import { TemplateService } from 'services/TemplateService';
import { UserService } from 'services/UserService';

interface AppServices {
  authService: AuthService;
  userService: UserService;
  templateService: TemplateService;
  templateAiService: TemplateAiService;
  editorAiService: EditorAiService;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children }: { children: ReactNode }) {
  const services = useMemo<AppServices>(() => {
    const authService = new AuthService();
    return {
      authService,
      userService: new UserService(),
      templateService: new TemplateService(),
      templateAiService: new TemplateAiService(() => authService.getToken()),
      editorAiService: new EditorAiService(() => authService.getToken()),
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
