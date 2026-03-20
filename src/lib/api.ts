const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') + '/api';

export const fetchDashboardStats = async () => {
  const res = await fetch(`${BASE_URL}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
};

export const fetchMetadataTables = async () => {
  const res = await fetch(`${BASE_URL}/metadata/tables`);
  if (!res.ok) throw new Error('Failed to fetch metadata tables');
  return res.json();
};

export const generateSql = async (requirement: string) => {
  const res = await fetch(`${BASE_URL}/generate-sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requirement }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || 'Failed to generate SQL');
  }
  return res.json();
};

// Live table search — returns { module_tag, table_name, description }[]
export const searchMetadataTables = async (q: string): Promise<any[]> => {
  if (!q.trim()) return [];
  const res = await fetch(`${BASE_URL}/metadata/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
};

// Fetch column definitions for a specific table
export const fetchTableColumns = async (tableName: string): Promise<any[]> => {
  const res = await fetch(`${BASE_URL}/metadata/columns/${encodeURIComponent(tableName)}`);
  if (!res.ok) throw new Error(`Failed to fetch columns for ${tableName}`);
  return res.json();
};

