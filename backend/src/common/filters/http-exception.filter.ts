import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const err    = exception.getResponse();

    const errorResponse = {
      success:   false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path:      req.url,
      method:    req.method,
      message:   typeof err === 'object' ? (err as any).message : err,
      errors:    typeof err === 'object' ? (err as any).errors : undefined,
    };

    if (status >= 500) this.logger.error(`${req.method} ${req.url}`, exception.stack);
    else this.logger.warn(`${req.method} ${req.url} – ${status}`);

    res.status(status).json(errorResponse);
  }
}
