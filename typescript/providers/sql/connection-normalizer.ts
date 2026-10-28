export const sqliteIsMemory = (connection: string): boolean => {
  const s = connection.trim();
  if (s === '' || s === ':memory:') return true;
  const compact = s.toLowerCase().replace(/\s+/g, '');
  return (
    compact.includes(':memory:') ||
    /[?&;]mode=memory(?:&|;|$)/.test(compact) ||
    compact.startsWith('mode=memory')
  );
};

export const sqliteFilesystemPath = (connection: string): string | null => {
  if (sqliteIsMemory(connection)) return null;
  let s = connection.trim();
  const eq = s.indexOf('=');
  if (eq >= 0 && /data\s*source/i.test(s.slice(0, eq))) {
    s = s.slice(eq + 1).trim();
    const semi = s.indexOf(';');
    if (semi >= 0) s = s.slice(0, semi).trim();
  } else if (/^sqlite:\/\//i.test(s)) {
    s = s.slice('sqlite://'.length);
  } else if (/^sqlite:/i.test(s)) {
    s = s.slice('sqlite:'.length);
  } else if (/^file:/i.test(s)) {
    s = s.slice('file:'.length);
  }
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  // sqlite:///./app.sqlite keeps the URI slash and would open /./app.sqlite.
  if (s.startsWith('/./')) s = s.slice(1);
  if (s === ':memory:' || s === '') return null;
  return s;
};

export type OracleConnectionConfig = {
  user: string;
  password: string;
  connectString: string;
};

export const parseOracleConnection = (
  connection: string | OracleConnectionConfig,
): OracleConnectionConfig => {
  if (typeof connection === 'object' && connection) return connection;
  const m = /^([^/]+)\/([^@]+)@(.+)$/.exec(String(connection));
  if (!m) {
    throw new Error(`Oracle connection must look like user/password@connectString`);
  }
  return { user: m[1] as string, password: m[2] as string, connectString: m[3] as string };
};
