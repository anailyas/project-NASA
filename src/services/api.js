import axios from 'axios';

export function createClient(baseURL) {
  return axios.create({
    baseURL: baseURL || '',
    timeout: 8000,
  });
}

export async function checkHealth(baseURL) {
  const client = createClient(baseURL);
  const response = await client.get('/health');
  return response.data;
}
