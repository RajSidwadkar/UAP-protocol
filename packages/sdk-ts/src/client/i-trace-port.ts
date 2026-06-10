export interface ITracePort {
  trace<T>(name: string, attributes: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T>;
}
