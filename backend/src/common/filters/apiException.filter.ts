import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string | string[];
  error: string;
  code: string;
  timestamp: string;
  path: string;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function statusToError(status: number): string {
  const statusName = HttpStatus[status] as string | undefined;
  if (!statusName) {
    return 'Internal Server Error';
  }
  return statusName
    .toString()
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function statusToCode(status: number): string {
  return toSnakeCase(statusToError(status)) || 'internal_server_error';
}

function extractMessage(responseBody: unknown, fallback: string): string | string[] {
  if (typeof responseBody === 'string') {
    return responseBody;
  }
  if (isRecord(responseBody)) {
    const message = responseBody.message;
    if (
      typeof message === 'string' ||
      (Array.isArray(message) && message.every((item) => typeof item === 'string'))
    ) {
      return message;
    }
  }
  return fallback;
}

function extractError(responseBody: unknown, fallback: string): string {
  if (isRecord(responseBody) && typeof responseBody.error === 'string') {
    return responseBody.error;
  }
  return fallback;
}

function extractCode(responseBody: unknown, status: number): string {
  if (isRecord(responseBody) && typeof responseBody.code === 'string') {
    return responseBody.code;
  }
  return statusToCode(status);
}

function extractDetails(responseBody: unknown): unknown {
  if (!isRecord(responseBody)) {
    return undefined;
  }

  const details: Record<string, unknown> = {};
  for (const key of ['errors', 'warnings', 'details']) {
    if (key in responseBody) {
      details[key] = responseBody[key];
    }
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = isHttpException ? exception.getResponse() : undefined;
    const fallbackError = statusToError(status);
    const fallbackMessage = exception instanceof Error ? exception.message : fallbackError;
    const details = extractDetails(responseBody);
    const body: ApiErrorBody = {
      success: false,
      statusCode: status,
      message: extractMessage(responseBody, fallbackMessage),
      error: extractError(responseBody, fallbackError),
      code: extractCode(responseBody, status),
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
      ...(details ? { details } : {}),
    };

    response.status(status).json(body);
  }
}
