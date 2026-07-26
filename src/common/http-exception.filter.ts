import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Erreur interne du serveur';
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof Error) {
      // On loggue le détail mais on ne le renvoie jamais au client.
      this.logger.error(exception.message, exception.stack);
    }

    reply.status(status).send({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
