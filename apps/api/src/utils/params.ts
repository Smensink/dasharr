/**
 * Utility to safely extract string param from Express request params
 */
export function getStringParam(param: string | string[]): string {
  return Array.isArray(param) ? param[0] : param;
}
