export function log(message: string, ...args: unknown[]) {
  console.error(new Date().toISOString(), message, ...args);
}

