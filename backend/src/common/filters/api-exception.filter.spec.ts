import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

import { ApiExceptionFilter } from './api-exception.filter';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    originalUrl: '/api/templates',
    url: '/api/templates',
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('ApiExceptionFilter', () => {
  it('preserves legacy top-level fields and adds standard error metadata', () => {
    const { host, response } = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new BadRequestException({
        message: 'Template layoutDocument failed schema validation',
        code: 'template_layout_invalid',
        errors: [{ path: 'layoutDocument', code: 'invalid_document' }],
        warnings: [],
      }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        message: 'Template layoutDocument failed schema validation',
        error: 'Bad Request',
        code: 'template_layout_invalid',
        path: '/api/templates',
        timestamp: expect.any(String) as string,
        details: {
          errors: [{ path: 'layoutDocument', code: 'invalid_document' }],
          warnings: [],
        },
      }),
    );
  });

  it('normalizes unexpected errors without exposing stack traces', () => {
    const { host, response } = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new Error('database failed'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        message: 'database failed',
        error: 'Internal Server Error',
        code: 'internal_server_error',
        path: '/api/templates',
      }),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.not.objectContaining({
        stack: expect.anything() as unknown,
      }),
    );
  });

  it('keeps string and array validation messages compatible with Nest defaults', () => {
    const { host, response } = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new InternalServerErrorException(), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal Server Error',
        error: 'Internal Server Error',
        code: 'internal_server_error',
      }),
    );
  });
});
