// Jest setup for unit tests
// Provides an in-memory mock for @supabase/supabase-js so unit tests run without network

type Row = Record<string, any>;
const db: Record<string, Row[]> = {
  eco_api_keys: [],
  eco_api_usage: [],
};

jest.mock('@supabase/supabase-js', () => {
  function filter(rows: Row[], filters: Array<{ field: string; value: any }>) {
    return filters.reduce((acc, f) => acc.filter((r) => r[f.field] === f.value), rows);
  }

  return {
    createClient: () => {
      return {
        from(tableName: string) {
          const table = db[tableName] || (db[tableName] = []);

          const queryState: { filters: Array<{ field: string; value: any }>; selection?: string } = {
            filters: [],
          };

          const chain = {
            // INSERT
            insert: (payload: any) => {
              const rows: Row[] = Array.isArray(payload) ? payload : [payload];
              rows.forEach((r) => table.push({ ...r, created_at: r.created_at || new Date().toISOString() }));
              const inserted = rows[rows.length - 1];
              return {
                select: (_sel?: string) => ({
                  single: async () => ({ data: inserted, error: null }),
                }),
                then: undefined, // prevent awaiting insert directly
              } as any;
            },
            // SELECT
            select: (sel?: string) => {
              queryState.selection = sel;
              return chain;
            },
            eq: (field: string, value: any) => {
              queryState.filters.push({ field, value });
              return chain;
            },
            order: async (_field: string, _opts?: any) => {
              const rows = filter(table, queryState.filters);
              return { data: rows, error: null };
            },
            single: async () => {
              const rows = filter(table, queryState.filters);
              if (!rows.length) return { data: null, error: new Error('not found') } as any;
              return { data: rows[0], error: null } as any;
            },
            update: (values: Row) => {
              return {
                eq: async (field: string, value: any) => {
                  let updated = false;
                  for (const row of table) {
                    if (row[field] === value) {
                      Object.assign(row, values);
                      updated = true;
                    }
                  }
                  return { data: null, error: null } as any;
                },
              };
            },
            delete: async () => ({ data: null, error: null }),
          };

          return chain;
        },
      } as any;
    },
  };
});

// Global test timeout
jest.setTimeout(10000); // 10 seconds

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long!';
