// Next reescribe href/redirect con el basePath, pero no las URL de fetch().
// Debe coincidir con el basePath de next.config.mjs.
export const BASE_PATH = "/crm";

export const apiUrl = (path: string) => `${BASE_PATH}${path}`;
