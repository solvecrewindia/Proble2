import { supabase } from './supabase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Cryptographic Helper: Generates SHA-256 HMAC signature using the browser's built-in Web Crypto API.
// This is pure, zero-dependency, and extremely fast.
async function generateSignature(timestamp: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  
  // 1. Import the raw secret key string into Web Crypto Key object
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  
  // 2. Sign the timestamp string
  const signatureBuffer = await window.crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(timestamp)
  );
  
  // 3. Convert the binary signature buffer into a standard Hexadecimal string
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Header Builder: Bundles cryptographic headers and active Supabase JWT tokens.
async function getRequestHeaders(): Promise<HeadersInit> {
  const backendSecret = import.meta.env.VITE_HANDSHAKE_SECRET || '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  // Calculate the time-based HMAC-SHA256 signature
  const signature = await generateSignature(timestamp, backendSecret);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-proble-timestamp': timestamp,
    'x-proble-signature': signature,
  };

  // Automatically fetch active Supabase Auth JWT token and inject it
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    console.error('Error fetching Supabase session for headers:', err);
  }

  return headers;
}

// Exportable API Client Utility
export const api = {
  // HTTP GET Wrapper
  async get<T = any>(path: string): Promise<T> {
    const headers = await getRequestHeaders();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  },
  
  // HTTP POST Wrapper
  async post<T = any>(path: string, body?: any): Promise<T> {
    const headers = await getRequestHeaders();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  },
  
  // HTTP PUT Wrapper
  async put<T = any>(path: string, body?: any): Promise<T> {
    const headers = await getRequestHeaders();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  },
  
  // HTTP DELETE Wrapper
  async delete<T = any>(path: string): Promise<T> {
    const headers = await getRequestHeaders();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.json();
  }
};
