export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        details: this.details,
      },
    };
  }
}

export const Errors = {
  // Chat errors
  ChatNotFound: (id: string) =>
    new AppError(`Chat ${id} not found`, "CHAT_NOT_FOUND", 404),

  ChatCreationFailed: (reason: string) =>
    new AppError(`Failed to create chat: ${reason}`, "CHAT_CREATION_FAILED", 500),

  // Artifact errors
  ArtifactNotFound: (id: string) =>
    new AppError(`Artifact ${id} not found`, "ARTIFACT_NOT_FOUND", 404),

  ArtifactGenerationFailed: (type: string, reason: string) =>
    new AppError(`Failed to generate ${type}: ${reason}`, "ARTIFACT_GENERATION_FAILED", 500),

  // Authentication errors
  Unauthorized: () =>
    new AppError("Unauthorized access", "UNAUTHORIZED", 401),

  InvalidToken: () =>
    new AppError("Invalid or expired token", "INVALID_TOKEN", 401),

  // Validation errors
  InvalidInput: (field: string, reason: string) =>
    new AppError(`Invalid input for ${field}: ${reason}`, "INVALID_INPUT", 400),

  // Database errors
  DatabaseError: (operation: string, reason: string) =>
    new AppError(`Database error during ${operation}: ${reason}`, "DATABASE_ERROR", 500),

  // AI errors
  AIError: (provider: string, reason: string) =>
    new AppError(`${provider} error: ${reason}`, "AI_ERROR", 500),
};

// Helper function to check if error is AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Helper function to get error message safely
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}
