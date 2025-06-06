import { trackError } from '../telemetry';
import Logger from '../utils/logger';

/**
 * Global error handler for CLI application
 * Handles both expected and unexpected errors with proper logging and telemetry
 */
export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Initialize global error handlers for uncaught exceptions and unhandled rejections
   */
  public initializeGlobalHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error: Error) => {
      Logger.error('Uncaught Exception:', error.message);
      Logger.debug('Stack trace:', error.stack || 'No stack trace available');

      this.handleError(error, {
        type: 'uncaughtException',
        fatal: true,
      });

      await this.gracefulShutdown(1);
    });

    // Handle unhandled promise rejections
    process.on(
      'unhandledRejection',
      async (reason: unknown, promise: Promise<any>) => {
        const error =
          reason instanceof Error ? reason : new Error(String(reason));
        Logger.error(
          'Unhandled Rejection at:',
          promise,
          'reason:',
          error.message
        );
        Logger.debug('Stack trace:', error.stack || 'No stack trace available');

        this.handleError(error, {
          type: 'unhandledRejection',
          fatal: true,
          metadata: { reason: String(reason) },
        });

        await this.gracefulShutdown(1);
      }
    );

    // Handle warnings
    process.on('warning', (warning) => {
      Logger.warn(`Warning: ${warning.name}: ${warning.message}`);
      if (warning.stack) {
        Logger.debug('Warning stack:', warning.stack);
      }
    });
  }

  /**
   * Handle command-specific errors (non-fatal)
   */
  public async handleCommandError(
    error: Error,
    commandName?: string,
    options?: { exitCode?: number; silent?: boolean }
  ): Promise<void> {
    const { exitCode = 1, silent = false } = options || {};

    if (!silent) {
      Logger.error(
        `Command failed${commandName ? ` (${commandName})` : ''}:`,
        error.message
      );
      Logger.debug('Error details:', error.stack || 'No stack trace available');
    }

    this.handleError(error, {
      type: 'commandError',
      fatal: false,
      metadata: {
        commandName,
        exitCode,
      },
    });

    if (exitCode > 0) {
      process.exit(exitCode);
    }
  }

  /**
   * Core error handling logic
   */
  private handleError(
    error: Error,
    context: {
      type: 'uncaughtException' | 'unhandledRejection' | 'commandError';
      fatal: boolean;
      metadata?: Record<string, any>;
    }
  ): void {
    // Track error via telemetry
    trackError(error, {
      metadata: {
        errorType: context.type,
        fatal: context.fatal,
        timestamp: new Date().toISOString(),
        ...context.metadata,
      },
    });
  }

  /**
   * Graceful shutdown with cleanup
   */
  private async gracefulShutdown(exitCode: number): Promise<void> {
    try {
      Logger.debug('Initiating graceful shutdown...');

      Logger.debug('Graceful shutdown completed');
    } catch (shutdownError) {
      Logger.error('Error during shutdown:', shutdownError);
    } finally {
      process.exit(exitCode);
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();
