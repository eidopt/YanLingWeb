import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
  meta?: {
    pagination?: {
      total: number;
      count: number;
    };
    count?: number;
  };
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isApiSuccessResponse(value: unknown): value is ApiSuccessResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    'data' in value &&
    typeof value.timestamp === 'string' &&
    typeof value.path === 'string'
  );
}

function isPaginatedPayload(
  value: unknown,
): value is { data: unknown[]; total: number } & Record<string, unknown> {
  return isRecord(value) && Array.isArray(value.data) && typeof value.total === 'number';
}

function shouldBypassResponse(response: Response): boolean {
  if (response.headersSent) {
    return true;
  }

  const contentType = response.getHeader('content-type');
  return typeof contentType === 'string' && contentType.toLowerCase().includes('text/event-stream');
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((payload: unknown) => {
        if (shouldBypassResponse(response) || isApiSuccessResponse(payload)) {
          return payload;
        }

        return this.wrapPayload(payload, request);
      }),
    );
  }

  private wrapPayload(payload: unknown, request: Request): ApiSuccessResponse {
    const base = {
      success: true as const,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
    };

    if (isPaginatedPayload(payload)) {
      return {
        ...payload,
        ...base,
        data: payload.data,
        meta: {
          pagination: {
            total: payload.total,
            count: payload.data.length,
          },
        },
      };
    }

    if (Array.isArray(payload)) {
      return {
        ...base,
        data: payload,
        meta: { count: payload.length },
      };
    }

    if (isRecord(payload)) {
      return {
        ...payload,
        ...base,
        data: payload,
      };
    }

    return {
      ...base,
      data: payload,
    };
  }
}
