const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const formatDate = (iso?: string) => (iso ? dateFormat.format(new Date(iso)) : '—');

export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const toHttps = (url: string) => url.replace(/^http:\/\//, 'https://');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
